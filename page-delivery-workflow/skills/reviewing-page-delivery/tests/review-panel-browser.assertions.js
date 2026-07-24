globalThis.runPageDeliveryBrowserAssertions = async function runPageDeliveryBrowserAssertions() {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const click = (element) => element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const pointer = (target, type, x, y, pointerId = 1) =>
    target?.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId }));
  const panel = () => document.querySelector("[data-page-delivery-review-host]")?.shadowRoot;
  const state = () => globalThis.__PAGE_DELIVERY_REVIEW__?.getState?.();
  const canonicalCard = (overrides = {}) => ({
    ...structuredClone(globalThis.reviewSession.cards[1]),
    id: "browser-card",
    conclusion: "待修改",
    reopened: false,
    evidenceChanged: false,
    ...overrides,
  });
  const consoleEvents = [];
  const consoleMethods = ["debug", "log", "info", "warn", "error"];
  const originalConsole = Object.fromEntries(consoleMethods.map((method) => [method, console[method]]));
  for (const method of consoleMethods) console[method] = (...args) => consoleEvents.push({ method, args });
  const submittedEvents = () => consoleEvents.filter(({ args }) => args[0] === "PAGE_DELIVERY_REVIEW_SUBMITTED" || args[0] === "PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED");
  const trackedListeners = [];
  const originalDocumentAdd = document.addEventListener;
  const originalDocumentRemove = document.removeEventListener;
  const originalWindowAdd = window.addEventListener;
  const originalWindowRemove = window.removeEventListener;
  const trackAdd = (target, original, type, listener, rest) => {
    if ((target === document && ["pointermove", "pointerup"].includes(type)) || (target === window && type === "resize")) {
      trackedListeners.push({ target, type, listener, removed: false });
    }
    return original.call(target, type, listener, ...rest);
  };
  const trackRemove = (target, original, type, listener, rest) => {
    const tracked = [...trackedListeners].reverse().find((entry) => entry.target === target && entry.type === type && entry.listener === listener && !entry.removed);
    if (tracked) tracked.removed = true;
    return original.call(target, type, listener, ...rest);
  };
  document.addEventListener = function (type, listener, ...rest) { return trackAdd(document, originalDocumentAdd, type, listener, rest); };
  document.removeEventListener = function (type, listener, ...rest) { return trackRemove(document, originalDocumentRemove, type, listener, rest); };
  window.addEventListener = function (type, listener, ...rest) { return trackAdd(window, originalWindowAdd, type, listener, rest); };
  window.removeEventListener = function (type, listener, ...rest) { return trackRemove(window, originalWindowRemove, type, listener, rest); };

  try {
    const host = document.querySelector("[data-page-delivery-review-host]");
    check(Boolean(host), "review host should exist");
    check(Boolean(host?.shadowRoot), "review host should use an open Shadow Root");
    check(panel()?.querySelectorAll("[data-review-card]").length === 1, "exactly one review card should be rendered");
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-002", "round should begin with the first active card");
    check(!JSON.stringify(state()).includes("/private/evidence-source"), "initial state must recursively sanitize nested artifact locations");
    check(getComputedStyle(panel()?.querySelector("[data-review-panel]")).color !== "rgb(0, 255, 0)", "host-page important styles must not pollute panel body color");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("交互验收"), "header should render the review domain");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("1/3"), "header should render the card sequence");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("会话 3") && panel()?.querySelector("[data-review-context]")?.textContent.includes("目标 3"), "header should derive canonical session and objective counts from active cards");
    for (const field of ["dimension", "links", "sourceEvidence", "reviewGoal", "design", "regionAndComponents", "interactionStates", "relatedApis", "mockScenarios", "acceptanceCriteria"]) {
      check(Boolean(panel()?.querySelector(`[data-card-field="${field}"]`)), `card should render ${field} when present`);
    }
    check([...panel()?.querySelectorAll('[data-field="conclusion"] option') || []].map((option) => option.value).join(",") === "未评审,已确认,待修改,阻塞,不适用", "input conclusions should use the fixed allowed set");

    const storageKey = `page-delivery-review:v1:${globalThis.reviewSession.deliveryUnitKey}`;
    const baseDraft = {
      sessionId: globalThis.reviewSession.sessionId,
      reviewRound: globalThis.reviewSession.reviewRound,
      planFingerprint: globalThis.reviewSession.planFingerprint,
      artifactRuleFingerprint: globalThis.reviewSession.artifactRuleFingerprint,
      artifactRuleResolution: globalThis.reviewSession.artifactRuleResolution,
      currentCardIndex: 2,
      collapsed: true,
      panelPosition: { x: 111, y: 123 },
      cards: [{ id: "REV-002", conclusion: "阻塞", userNote: "不应恢复" }],
    };
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    localStorage.setItem(storageKey, JSON.stringify({ ...baseDraft, sessionId: "stale-session", savedAt: Date.now() }));
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
    check(state()?.collapsed === false && state()?.currentCardIndex === 0 && state()?.panelPosition?.y !== 123, "mismatched draft metadata must not affect any panel UI state");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    localStorage.setItem(storageKey, JSON.stringify({ ...baseDraft, savedAt: Date.now() + 60_000 }));
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
    check(state()?.collapsed === false && state()?.currentCardIndex === 0 && state()?.panelPosition?.y !== 123, "future draft timestamps must not affect any panel UI state");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    localStorage.removeItem(storageKey);
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);

    let legacyDestroyCalls = 0;
    globalThis.__PAGE_DELIVERY_REVIEW__ = { destroy: () => { legacyDestroyCalls += 1; } };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
    check(legacyDestroyCalls === 1, "mount should destroy a previous script instance API before adding listeners");
    check(document.querySelectorAll("[data-page-delivery-review-host]").length === 1, "mount should be idempotent and retain one host");

    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelectorAll("[data-review-card]").length === 1, "next should still render one card");
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-003", "next should change the current card");
    click(panel()?.querySelector('[data-action="previous"]'));
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-002", "previous should restore the prior card");
    check(!panel()?.querySelector('[data-action="submit"]'), "only the last input card should offer submission");
    click(panel()?.querySelector('[data-action="next"]'));
    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-004", "input navigation should reach the last card");
    check(Boolean(panel()?.querySelector('[data-action="submit"]')), "last input card should offer submission");
    click(panel()?.querySelector('[data-action="previous"]'));

    const note = panel()?.querySelector('[data-field="userNote"]');
    note.value = "恢复这条草稿";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    click(panel()?.querySelector('[data-action="toggle-collapse"]'));
    pointer(panel()?.querySelector("[data-review-panel-titlebar]"), "pointerdown", 10, 10);
    pointer(document, "pointermove", innerWidth + 240, innerHeight + 240);
    pointer(document, "pointerup", innerWidth + 240, innerHeight + 240);
    const saved = state();
    check(Boolean(localStorage.getItem(storageKey)), "editable draft should be persisted");
    const persistedDraft = JSON.parse(localStorage.getItem(storageKey));
    check(persistedDraft.currentCardIndex === 1, "draft should persist the current input card index");
    check(persistedDraft.sessionId === "session-1" && persistedDraft.reviewRound === 2 && persistedDraft.planFingerprint === "sha256:fixture" && persistedDraft.artifactRuleFingerprint === "sha256:rule-fixture" && Number.isFinite(persistedDraft.savedAt), "draft should persist matching metadata and a saved timestamp");
    check(!JSON.stringify(persistedDraft).includes("evidence") && !JSON.stringify(persistedDraft).includes("results"), "draft must exclude evidence and results");
    check(saved?.collapsed === true, "collapse state should be persisted");
    check(saved?.panelPosition?.x >= 0 && saved?.panelPosition?.y >= 0, "drag position should stay inside the viewport");
    check(saved?.panelPosition?.x <= innerWidth && saved?.panelPosition?.y <= innerHeight, "drag position should be clamped to the viewport");
    check(saved?.panelPosition?.x === 0 || saved?.panelPosition?.x >= innerWidth - 340, "drag should snap to a horizontal viewport edge");

    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
    check(state()?.collapsed === true, "collapsed draft should be restored after remount");
    check(state()?.currentCardIndex === 1, "current input card index should be restored after remount");
    click(panel()?.querySelector('[data-action="toggle-collapse"]'));
    check(panel()?.querySelector('[data-field="userNote"]')?.value === "恢复这条草稿", "note draft should be restored after remount");

    click(panel()?.querySelector('[data-action="previous"]'));
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-002", "evidence verification should use the card with an explicit selector");
    const evidenceTarget = document.querySelector("#login-form");
    const originalStyle = evidenceTarget.getAttribute("style");
    click(panel()?.querySelector('[data-action="highlight-evidence"]'));
    check(Boolean(document.querySelector("[data-review-evidence-overlay]")), "evidence click should create an overlay");
    check(evidenceTarget.getAttribute("style") === originalStyle, "evidence highlighting must not change the target style attribute");
    click(document.querySelector("[data-review-evidence-overlay]"));
    check(!document.querySelector("[data-review-evidence-overlay]"), "evidence overlay should be removable");

    click(panel()?.querySelector('[data-action="next"]'));
    click(panel()?.querySelector('[data-action="next"]'));
    check(Boolean(panel()?.querySelector('[data-action="submit"]')), "last restored input card should expose submission");
    click(panel()?.querySelector('[data-action="submit"]'));
    check(state()?.mode === "reviewing", "submit should enter reviewing mode");
    check(panel()?.querySelector('[data-field="userNote"]')?.disabled === true, "submit should freeze inputs");
    check(submittedEvents().length === 1 && submittedEvents()[0].args[0] === "PAGE_DELIVERY_REVIEW_SUBMITTED", "submit should emit exactly the lightweight submit event");
    check(Object.keys(submittedEvents()[0]?.args[1] || {}).sort().join(",") === "sessionId,submissionVersion", "submit event should omit full submission data");
    const submission = globalThis.__PAGE_DELIVERY_REVIEW__.exportSubmission();
    check(submission?.cards?.length === 3 && submission?.sessionId === "session-1", "exportSubmission should return the complete frozen snapshot");
    check(!JSON.stringify(submission).includes("/private/evidence-source"), "submission must recursively sanitize nested artifact locations");

    globalThis.__PAGE_DELIVERY_REVIEW__.applyResult({
      sessionId: submission.sessionId,
      submissionVersion: submission.submissionVersion,
      planFingerprint: submission.planFingerprint,
      artifactRuleFingerprint: submission.artifactRuleFingerprint,
      results: [
        { id: "other", conclusion: "已确认", summary: "全部接受", planChangeSummary: "无需调整 Plan" },
        { id: "conflict", conclusion: "冲突" },
        { id: "pending", conclusion: "待修改" },
        { id: "blocking", conclusion: "阻塞", dimension: "结果域", nested: { artifactPath: "/private/result" } },
      ],
    });
    check(state()?.mode === "result", "matching result should enter result mode");
    check(panel()?.querySelectorAll("[data-review-result]").length === 1, "result mode should render exactly one result card");
    check(panel()?.querySelector("[data-review-result]")?.getAttribute("data-result-id") === "blocking", "results should begin with blocking items");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("结果域") && panel()?.querySelector("[data-review-context]")?.textContent.includes("1/4"), "result header should use the result domain and result sequence");
    check(!JSON.stringify(state()).includes("/private/result") && !panel()?.textContent.includes("/private/result"), "result state and DOM must not leak nested artifact locations");
    check(!panel()?.querySelector('[data-action="confirm-plan"]'), "only the last result card should offer plan confirmation");
    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelector("[data-review-result]")?.getAttribute("data-result-id") === "pending", "result navigation should preserve priority order");
    click(panel()?.querySelector('[data-action="next"]'));
    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelector("[data-review-result]")?.getAttribute("data-result-id") === "other", "result navigation should reach the final ordered result");
    check(Boolean(panel()?.querySelector("[data-result-summary]")) && Boolean(panel()?.querySelector("[data-result-plan-change-summary]")), "last result should render available summary and plan change summary");
    check(Boolean(panel()?.querySelector('[data-action="confirm-plan"]')), "last result card should offer plan confirmation");
    globalThis.__PAGE_DELIVERY_REVIEW__.confirmPlan({
      planFingerprint: submission.planFingerprint,
      artifactRuleFingerprint: submission.artifactRuleFingerprint,
    });
    check(state()?.mode === "result" && state()?.lastError?.code === "confirmation-request-required", "public confirmation must fail before a trusted UI request");
    const eventsBeforeSyntheticConfirm = submittedEvents().length;
    click(panel()?.querySelector('[data-action="confirm-plan"]'));
    check(submittedEvents().length === eventsBeforeSyntheticConfirm, "page-world element.click must not emit a Plan confirmation request");
    globalThis.__PAGE_DELIVERY_REVIEW__.confirmPlan({ planFingerprint: submission.planFingerprint, artifactRuleFingerprint: submission.artifactRuleFingerprint });
    check(state()?.mode === "result" && state()?.lastError?.code === "confirmation-request-required", "synthetic clicks must not create a consumable confirmation request");
    check(consoleEvents.length === 1 && consoleEvents[0]?.method === "debug" && consoleEvents[0]?.args?.[0] === "PAGE_DELIVERY_REVIEW_SUBMITTED" && !JSON.stringify(consoleEvents).includes("/private"), "console should emit only the lightweight submit event without full submission data");

    window.dispatchEvent(new Event("resize"));
    const panelRect = document.querySelector("[data-page-delivery-review-host]").getBoundingClientRect();
    check(panelRect.bottom <= innerHeight + 1, "panel bottom should remain reachable after resize");
    check(["auto", "scroll"].includes(getComputedStyle(panel()?.querySelector("[data-review-body]")).overflowY), "long panel body should scroll within a viewport bound");

    const destroyedStorage = localStorage.getItem(storageKey);
    const destroyedState = state();
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    pointer(document, "pointermove", 1, 1);
    pointer(document, "pointerup", 1, 1);
    window.dispatchEvent(new Event("resize"));
    check(!document.querySelector("[data-page-delivery-review-host]"), "destroy should remove the host");
    check(!document.querySelector("[data-review-evidence-overlay]"), "destroy should remove evidence overlays");
    check(!globalThis.__PAGE_DELIVERY_REVIEW__, "destroy should remove the temporary global API");
    check(localStorage.getItem(storageKey) === destroyedStorage && destroyedState?.mode === "result", "destroy should remove listeners so pointer and resize events cannot mutate state or storage");
    check(trackedListeners.length > 0 && trackedListeners.every((entry) => entry.removed), "destroy should pair every runtime pointermove/pointerup/resize listener with the same removeEventListener identity");

    localStorage.removeItem(storageKey);
    const allResolvedSession = {
      ...globalThis.reviewSession,
      cards: [canonicalCard({ id: "resolved", conclusion: "已确认" })],
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(allResolvedSession);
    check(Boolean(panel()?.querySelector("[data-review-empty]")), "an empty active round should render an explicit empty state");
    check(!panel()?.querySelector("[data-review-context]")?.textContent.includes("1/0"), "empty round header must not display 1/0");
    check(!panel()?.querySelector('[data-field="conclusion"], [data-field="userNote"], [data-action="highlight-evidence"], [data-action="next"], [data-action="previous"], [data-action="submit"]'), "empty state must hide review controls");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    check(trackedListeners.every((entry) => entry.removed), "empty panel destroy should also remove its tracked runtime listeners");

    const allScopeSession = { ...globalThis.reviewSession, viewScope: "all" };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(allScopeSession);
    check(state()?.cards?.length === 4, "viewScope=all should retain every review card, including confirmed cards");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();

    const taintedResolutionSession = {
      ...globalThis.reviewSession,
      sessionId: "tainted-resolution-session",
      deliveryUnitKey: "sample/tainted-resolution",
      artifactRuleResolution: {
        status: "temporarily-confirmed-candidate",
        source: "candidate",
        confirmedRuleFingerprint: globalThis.reviewSession.artifactRuleFingerprint,
        absolutePath: "/secret/AGENTS.md",
        artifactPath: "/private/rule",
        unknown: "drop-me",
      },
      cards: [canonicalCard({ id: "tainted-resolution-card" })],
    };
    const taintedStorageKey = `page-delivery-review:v1:${taintedResolutionSession.deliveryUnitKey}`;
    const canonicalTemporaryResolution = {
      status: "temporarily-confirmed-candidate",
      source: "candidate",
      confirmedRuleFingerprint: globalThis.reviewSession.artifactRuleFingerprint,
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(taintedResolutionSession);
    check(JSON.stringify(state()?.artifactRuleResolution) === JSON.stringify(canonicalTemporaryResolution), "state must retain only the canonical temporary confirmation fields");
    check(!JSON.stringify(state()).includes("/secret/AGENTS.md") && !JSON.stringify(state()).includes("/private/rule") && !JSON.stringify(state()).includes("drop-me"), "state must canonicalize artifact-rule resolution metadata");
    const taintedNote = panel()?.querySelector('[data-field="userNote"]');
    taintedNote.value = "触发安全草稿";
    taintedNote.dispatchEvent(new Event("input", { bubbles: true }));
    check(JSON.stringify(JSON.parse(localStorage.getItem(taintedStorageKey)).artifactRuleResolution) === JSON.stringify(canonicalTemporaryResolution), "localStorage draft must retain only the canonical temporary confirmation fields");
    check(!localStorage.getItem(taintedStorageKey).includes("/secret/AGENTS.md") && !localStorage.getItem(taintedStorageKey).includes("/private/rule") && !localStorage.getItem(taintedStorageKey).includes("drop-me"), "localStorage draft must canonicalize artifact-rule resolution metadata");
    click(panel()?.querySelector('[data-action="submit"]'));
    const taintedSubmission = globalThis.__PAGE_DELIVERY_REVIEW__.exportSubmission();
    check(JSON.stringify(taintedSubmission.artifactRuleResolution) === JSON.stringify(canonicalTemporaryResolution), "exportSubmission must retain only the canonical temporary confirmation fields");
    check(!JSON.stringify(taintedSubmission).includes("/secret/AGENTS.md") && !JSON.stringify(taintedSubmission).includes("/private/rule") && !JSON.stringify(taintedSubmission).includes("drop-me"), "exportSubmission must canonicalize artifact-rule resolution metadata");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    localStorage.removeItem(taintedStorageKey);

    const changedPlanSession = {
      ...globalThis.reviewSession,
      sessionId: "changed-plan-session",
      planFingerprint: "sha256:changed-plan",
    };
    localStorage.setItem(storageKey, JSON.stringify({
      deliveryUnitKey: changedPlanSession.deliveryUnitKey,
      sessionId: "old-plan-session",
      reviewRound: changedPlanSession.reviewRound,
      planFingerprint: "sha256:fixture",
      artifactRuleFingerprint: changedPlanSession.artifactRuleFingerprint,
      artifactRuleResolution: changedPlanSession.artifactRuleResolution,
      savedAt: Date.now(),
      collapsed: true,
      panelPosition: { x: 111, y: 123 },
      cards: [{ id: "REV-002", conclusion: "阻塞", userNote: "不能恢复" }],
    }));
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(changedPlanSession);
    check(state()?.collapsed === true && state()?.panelPosition?.y === 123, "a changed plan may restore safe panel preferences for the same delivery unit");
    check(state()?.cards?.[0]?.conclusion !== "阻塞" && state()?.cards?.[0]?.userNote !== "不能恢复", "a changed plan must not restore prior review conclusions or notes");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    localStorage.removeItem(storageKey);

    const unresolvedSession = {
      ...globalThis.reviewSession,
      sessionId: "unresolved-rule-session",
      deliveryUnitKey: "sample/unresolved-rule",
      reviewRound: 1,
      artifactRuleResolution: {
        status: "unresolved-candidate",
        source: "candidate",
      },
      cards: [canonicalCard({ id: "unresolved-rule-card", conclusion: "阻塞" })],
    };
    let unresolvedError = null;
    try {
      globalThis.PageDeliveryReviewPanel.mountReviewPanel(unresolvedSession);
    } catch (error) {
      unresolvedError = error;
    }
    check(unresolvedError?.code === "artifact-rule-confirmation-required", "unresolved artifact rules must fail before mounting review cards");
    check(!document.querySelector("[data-page-delivery-review-host]"), "unresolved artifact rules must not mount a panel host");

    for (const [artifactRuleResolution, expectedCode] of [
      [{
        status: "temporarily-confirmed-candidate",
        source: "candidate",
      }, "invalid-artifact-rule-resolution"],
      [{
        status: "temporarily-confirmed-candidate",
        source: "candidate",
        confirmedRuleFingerprint: "sha256:different-rule",
      }, "artifact-rule-confirmation-required"],
    ]) {
      let temporaryError = null;
      try {
        globalThis.PageDeliveryReviewPanel.mountReviewPanel({
          ...unresolvedSession,
          artifactRuleResolution,
        });
      } catch (error) {
        temporaryError = error;
      }
      check(
        temporaryError?.code === expectedCode,
        "temporary candidate confirmation must reject a missing or mismatched fingerprint",
      );
    }

    const temporarilyConfirmedSession = {
      ...unresolvedSession,
      artifactRuleResolution: {
        status: "temporarily-confirmed-candidate",
        source: "candidate",
        confirmedRuleFingerprint: unresolvedSession.artifactRuleFingerprint,
      },
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(temporarilyConfirmedSession);
    click(panel()?.querySelector('[data-action="submit"]'));
    const unresolvedSubmission = globalThis.__PAGE_DELIVERY_REVIEW__.exportSubmission();
    globalThis.__PAGE_DELIVERY_REVIEW__.applyResult({
      sessionId: unresolvedSubmission.sessionId,
      submissionVersion: unresolvedSubmission.submissionVersion,
      planFingerprint: unresolvedSubmission.planFingerprint,
      artifactRuleFingerprint: unresolvedSubmission.artifactRuleFingerprint,
      results: [{ id: "unresolved-rule-result", conclusion: "阻塞" }],
    });
    const unresolvedConfirm = panel()?.querySelector('[data-action="confirm-plan"]');
    check(unresolvedConfirm?.disabled === true, "unresolved artifact rules should disable Plan confirmation");
    check(panel()?.querySelector("[data-review-confirm-blocked]")?.textContent.includes("AGENTS.md"), "unresolved artifact rules should show a visible AGENTS gate");
    const eventsBeforeUnresolvedClick = submittedEvents().length;
    click(unresolvedConfirm);
    check(submittedEvents().length === eventsBeforeUnresolvedClick, "unresolved artifact rules must not emit a Plan confirmation request");
    globalThis.__PAGE_DELIVERY_REVIEW__.confirmPlan({
      planFingerprint: unresolvedSubmission.planFingerprint,
      artifactRuleFingerprint: unresolvedSubmission.artifactRuleFingerprint,
    });
    check(state()?.mode === "result" && state()?.lastError?.code === "confirmation-request-required", "the public API must reject confirmation without a trusted request");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();

    const frame = document.createElement("iframe");
    frame.setAttribute("data-review-evidence-frame", "");
    frame.style.cssText = "border:7px solid transparent;height:120px;left:111px;position:fixed;top:73px;width:220px;";
    frame.srcdoc = '<style>body{margin:0}#frame-target{height:21px;left:19px;position:absolute;top:13px;width:31px}</style><div id="frame-target"></div>';
    const frameLoaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    document.body.append(frame);
    await frameLoaded;
    const frameEvidenceSession = {
      ...globalThis.reviewSession,
      deliveryUnitKey: "sample/frame-evidence",
      reviewRound: 1,
      cards: [canonicalCard({
        id: "frame-evidence",
        sourceEvidence: [{ id: "frame-evidence-source", kind: "prototype", label: "frame target", frameSelector: "[data-review-evidence-frame]", selector: "#frame-target" }],
      })],
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(frameEvidenceSession);
    const frameRect = frame.getBoundingClientRect();
    const targetRect = frame.contentDocument.querySelector("#frame-target").getBoundingClientRect();
    click(panel()?.querySelector('[data-action="highlight-evidence"]'));
    const frameOverlay = document.querySelector("[data-review-evidence-overlay]");
    check(Math.abs(parseFloat(frameOverlay?.style.left) - (frameRect.left + frame.clientLeft + targetRect.left)) <= 1, "iframe evidence overlay left should use top-level frame coordinates and client border");
    check(Math.abs(parseFloat(frameOverlay?.style.top) - (frameRect.top + frame.clientTop + targetRect.top)) <= 1, "iframe evidence overlay top should use top-level frame coordinates and client border");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    frame.remove();

    const unavailableEvidenceSession = {
      ...globalThis.reviewSession,
      reviewRound: 1,
      cards: [canonicalCard({
        id: "bad-evidence",
        sourceEvidence: [{ id: "bad-evidence-source", kind: "prototype", label: "bad selector", selector: "[" }],
      })],
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(unavailableEvidenceSession);
    click(panel()?.querySelector('[data-action="highlight-evidence"]'));
    check(panel()?.querySelector("[data-review-evidence-status]")?.textContent.includes("无法定位"), "invalid evidence selectors should show a visible unavailable message");
    check(!document.querySelector("[data-review-evidence-overlay]"), "invalid evidence selectors should not create an overlay");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();

    const conflictSession = {
      ...globalThis.reviewSession,
      reviewRound: 1,
      cards: [canonicalCard({ id: "conflict-card" })],
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(conflictSession);
    click(panel()?.querySelector('[data-action="submit"]'));
    const conflictSubmission = globalThis.__PAGE_DELIVERY_REVIEW__.exportSubmission();
    globalThis.__PAGE_DELIVERY_REVIEW__.applyResult({
      sessionId: conflictSubmission.sessionId,
      submissionVersion: conflictSubmission.submissionVersion,
      planFingerprint: "sha256:changed-plan",
      artifactRuleFingerprint: conflictSubmission.artifactRuleFingerprint,
      results: [{ id: "conflict-result", conclusion: "已确认" }],
    });
    check(state()?.mode === "reviewing" && state()?.lastError?.code === "plan-conflict", "plan fingerprint conflicts must stay out of result mode");
    check(panel()?.querySelector("[data-review-error]")?.textContent.includes("Plan 已变化"), "plan conflicts should show an actionable visible message");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();

    const storagePrototype = Object.getPrototypeOf(localStorage);
    const originalGetItem = storagePrototype.getItem;
    const originalSetItem = storagePrototype.setItem;
    try {
      storagePrototype.getItem = () => { throw new Error("storage disabled"); };
      storagePrototype.setItem = () => { throw new Error("storage disabled"); };
      globalThis.PageDeliveryReviewPanel.mountReviewPanel(conflictSession);
      const unavailableStorageNote = panel()?.querySelector('[data-field="userNote"]');
      unavailableStorageNote.value = "仍可编辑";
      unavailableStorageNote.dispatchEvent(new Event("input", { bubbles: true }));
      check(state()?.cards?.[0]?.userNote === "仍可编辑", "the panel should remain usable when localStorage is unavailable");
      globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    } finally {
      storagePrototype.getItem = originalGetItem;
      storagePrototype.setItem = originalSetItem;
    }
  } catch (error) {
    failures.push(`assertion execution failed: ${error?.message || error}`);
  } finally {
    for (const method of consoleMethods) console[method] = originalConsole[method];
    document.addEventListener = originalDocumentAdd;
    document.removeEventListener = originalDocumentRemove;
    window.addEventListener = originalWindowAdd;
    window.removeEventListener = originalWindowRemove;
  }

  return { valid: failures.length === 0, failures };
};
