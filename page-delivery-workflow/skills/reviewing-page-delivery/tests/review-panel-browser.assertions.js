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
  const submittedEvents = [];
  const originalDebug = console.debug;
  console.debug = (...args) => {
    if (args[0] === "PAGE_DELIVERY_REVIEW_SUBMITTED" || args[0] === "PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED") {
      submittedEvents.push(args);
    }
  };

  try {
    const host = document.querySelector("[data-page-delivery-review-host]");
    check(Boolean(host), "review host should exist");
    check(Boolean(host?.shadowRoot), "review host should use an open Shadow Root");
    check(panel()?.querySelectorAll("[data-review-card]").length === 1, "exactly one review card should be rendered");
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-002", "round should begin with the first active card");
    check(getComputedStyle(panel()?.querySelector("[data-review-panel]")).color !== "rgb(0, 255, 0)", "host-page important styles must not pollute panel body color");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("交互验收"), "header should render the review domain");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("1/3"), "header should render the card sequence");
    check(panel()?.querySelector("[data-review-context]")?.textContent.includes("4") && panel()?.querySelector("[data-review-context]")?.textContent.includes("2"), "header should render session and objective counts when provided");
    for (const field of ["reviewDomain", "reviewTarget", "design", "evidence", "relatedApis", "mockScenarios", "acceptanceCriteria"]) {
      check(Boolean(panel()?.querySelector(`[data-card-field="${field}"]`)), `card should render ${field} when present`);
    }
    check(Boolean(panel()?.querySelector("[data-card-related-refs]")), "card should render related refs when present");
    check([...panel()?.querySelectorAll('[data-field="conclusion"] option') || []].map((option) => option.value).join(",") === "未评审,已确认,待修改,阻塞,不适用", "input conclusions should use the fixed allowed set");

    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
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
    check(Boolean(localStorage.getItem(`page-delivery-review:v1:${globalThis.reviewSession.deliveryUnitKey}`)), "editable draft should be persisted");
    const persistedDraft = JSON.parse(localStorage.getItem(`page-delivery-review:v1:${globalThis.reviewSession.deliveryUnitKey}`));
    check(persistedDraft.currentCardIndex === 1, "draft should persist the current input card index");
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
    check(submittedEvents.length === 1 && submittedEvents[0][0] === "PAGE_DELIVERY_REVIEW_SUBMITTED", "submit should emit exactly the lightweight submit event");
    check(Object.keys(submittedEvents[0]?.[1] || {}).sort().join(",") === "sessionId,submissionVersion", "submit event should omit full submission data");
    const submission = globalThis.__PAGE_DELIVERY_REVIEW__.exportSubmission();
    check(submission?.cards?.length === 3 && submission?.sessionId === "session-1", "exportSubmission should return the complete frozen snapshot");

    globalThis.__PAGE_DELIVERY_REVIEW__.applyResult({
      sessionId: submission.sessionId,
      submissionVersion: submission.submissionVersion,
      results: [
        { id: "other", conclusion: "已确认", summary: "全部接受", planChangeSummary: "无需调整 Plan" },
        { id: "conflict", conclusion: "冲突" },
        { id: "pending", conclusion: "待修改" },
        { id: "blocking", conclusion: "阻塞" },
      ],
    });
    check(state()?.mode === "result", "matching result should enter result mode");
    check(panel()?.querySelectorAll("[data-review-result]").length === 1, "result mode should render exactly one result card");
    check(panel()?.querySelector("[data-review-result]")?.getAttribute("data-result-id") === "blocking", "results should begin with blocking items");
    check(!panel()?.querySelector('[data-action="confirm-plan"]'), "only the last result card should offer plan confirmation");
    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelector("[data-review-result]")?.getAttribute("data-result-id") === "pending", "result navigation should preserve priority order");
    click(panel()?.querySelector('[data-action="next"]'));
    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelector("[data-review-result]")?.getAttribute("data-result-id") === "other", "result navigation should reach the final ordered result");
    check(Boolean(panel()?.querySelector("[data-result-summary]")) && Boolean(panel()?.querySelector("[data-result-plan-change-summary]")), "last result should render available summary and plan change summary");
    check(Boolean(panel()?.querySelector('[data-action="confirm-plan"]')), "last result card should offer plan confirmation");
    click(panel()?.querySelector('[data-action="confirm-plan"]'));
    check(submittedEvents.some((event) => event[0] === "PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED"), "confirm should emit a plan confirmation event");
    check(state()?.mode === "confirmed", "confirm should transition only the panel state");

    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    check(!document.querySelector("[data-page-delivery-review-host]"), "destroy should remove the host");
    check(!document.querySelector("[data-review-evidence-overlay]"), "destroy should remove evidence overlays");
    check(!globalThis.__PAGE_DELIVERY_REVIEW__, "destroy should remove the temporary global API");
  } catch (error) {
    failures.push(`assertion execution failed: ${error?.message || error}`);
  } finally {
    console.debug = originalDebug;
  }

  return { valid: failures.length === 0, failures };
};
