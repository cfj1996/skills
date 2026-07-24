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
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("4") && panel()?.querySelector("[data-review-context]")?.textContent.includes("2"), "header should render session and objective counts when provided");
    for (const field of ["reviewDomain", "reviewTarget", "design", "evidence", "relatedApis", "mockScenarios", "acceptanceCriteria"]) {
      check(Boolean(panel()?.querySelector(`[data-card-field="${field}"]`)), `card should render ${field} when present`);
    }
    check(Boolean(panel()?.querySelector("[data-card-related-refs]")), "card should render related refs when present");
    check([...panel()?.querySelectorAll('[data-field="conclusion"] option') || []].map((option) => option.value).join(",") === "未评审,已确认,待修改,阻塞,不适用", "input conclusions should use the fixed allowed set");

    const storageKey = `page-delivery-review:v1:${globalThis.reviewSession.deliveryUnitKey}`;
    const baseDraft = {
      sessionId: globalThis.reviewSession.sessionId,
      reviewRound: globalThis.reviewSession.reviewRound,
      planFingerprint: globalThis.reviewSession.planFingerprint,
      artifactRuleFingerprint: globalThis.reviewSession.artifactRuleFingerprint,
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

    const evidenceTarget = document.querySelector("#login-form");
    const originalStyle = evidenceTarget.getAttribute("style");
    click(panel()?.querySelector('[data-action="highlight-evidence"]'));
    check(Boolean(document.querySelector("[data-review-evidence-overlay]")), "evidence click should create an overlay");
    check(evidenceTarget.getAttribute("style") === originalStyle, "evidence highlighting must not change the target style attribute");
    click(document.querySelector("[data-review-evidence-overlay]"));
    check(!document.querySelector("[data-review-evidence-overlay]"), "evidence overlay should be removable");

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
      results: [
        { id: "other", conclusion: "已确认", summary: "全部接受", planChangeSummary: "无需调整 Plan" },
        { id: "conflict", conclusion: "冲突" },
        { id: "pending", conclusion: "待修改" },
        { id: "blocking", conclusion: "阻塞", reviewDomain: "结果域", nested: { artifactPath: "/private/result" } },
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
    click(panel()?.querySelector('[data-action="confirm-plan"]'));
    check(submittedEvents().some((event) => event.args[0] === "PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED"), "confirm should emit a plan confirmation event");
    check(state()?.mode === "confirmed", "confirm should transition only the panel state");
    check(consoleEvents.length === 2 && consoleEvents.every(({ method, args }) => method === "debug" && ["PAGE_DELIVERY_REVIEW_SUBMITTED", "PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED"].includes(args[0]) && !JSON.stringify(args).includes("/private")), "console should emit only the two lightweight events without full submission data");

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
    check(localStorage.getItem(storageKey) === destroyedStorage && destroyedState?.mode === "confirmed", "destroy should remove listeners so pointer and resize events cannot mutate state or storage");
    check(trackedListeners.length > 0 && trackedListeners.every((entry) => entry.removed), "destroy should pair every runtime pointermove/pointerup/resize listener with the same removeEventListener identity");

    localStorage.removeItem(storageKey);
    const allResolvedSession = {
      ...globalThis.reviewSession,
      cards: [{ id: "resolved", conclusion: "已确认", reopened: false, evidenceChanged: false }],
    };
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(allResolvedSession);
    check(Boolean(panel()?.querySelector("[data-review-empty]")), "an empty active round should render an explicit empty state");
    check(!panel()?.querySelector("[data-review-context]")?.textContent.includes("1/0"), "empty round header must not display 1/0");
    check(!panel()?.querySelector('[data-field="conclusion"], [data-field="userNote"], [data-action="highlight-evidence"], [data-action="next"], [data-action="previous"], [data-action="submit"]'), "empty state must hide review controls");
    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    check(trackedListeners.every((entry) => entry.removed), "empty panel destroy should also remove its tracked runtime listeners");
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
