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

    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
    check(document.querySelectorAll("[data-page-delivery-review-host]").length === 1, "mount should be idempotent and retain one host");

    click(panel()?.querySelector('[data-action="next"]'));
    check(panel()?.querySelectorAll("[data-review-card]").length === 1, "next should still render one card");
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-003", "next should change the current card");
    click(panel()?.querySelector('[data-action="previous"]'));
    check(panel()?.querySelector("[data-review-card]")?.getAttribute("data-card-id") === "REV-002", "previous should restore the prior card");

    const note = panel()?.querySelector('[data-field="userNote"]');
    note.value = "恢复这条草稿";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    click(panel()?.querySelector('[data-action="toggle-collapse"]'));
    pointer(panel()?.querySelector("[data-review-panel-titlebar]"), "pointerdown", 10, 10);
    pointer(document, "pointermove", innerWidth + 240, innerHeight + 240);
    pointer(document, "pointerup", innerWidth + 240, innerHeight + 240);
    const saved = state();
    check(Boolean(localStorage.getItem(`page-delivery-review:v1:${globalThis.reviewSession.deliveryUnitKey}`)), "editable draft should be persisted");
    check(saved?.collapsed === true, "collapse state should be persisted");
    check(saved?.panelPosition?.x >= 0 && saved?.panelPosition?.y >= 0, "drag position should stay inside the viewport");
    check(saved?.panelPosition?.x <= innerWidth && saved?.panelPosition?.y <= innerHeight, "drag position should be clamped to the viewport");
    check(saved?.panelPosition?.x === 0 || saved?.panelPosition?.x >= innerWidth - 340, "drag should snap to a horizontal viewport edge");

    globalThis.__PAGE_DELIVERY_REVIEW__.destroy();
    globalThis.PageDeliveryReviewPanel.mountReviewPanel(globalThis.reviewSession);
    check(state()?.collapsed === true, "collapsed draft should be restored after remount");
    click(panel()?.querySelector('[data-action="toggle-collapse"]'));
    check(panel()?.querySelector('[data-field="userNote"]')?.value === "恢复这条草稿", "note draft should be restored after remount");

    const evidenceTarget = document.querySelector("#login-form");
    const originalStyle = evidenceTarget.getAttribute("style");
    click(panel()?.querySelector('[data-action="highlight-evidence"]'));
    check(Boolean(document.querySelector("[data-review-evidence-overlay]")), "evidence click should create an overlay");
    check(evidenceTarget.getAttribute("style") === originalStyle, "evidence highlighting must not change the target style attribute");
    click(document.querySelector("[data-review-evidence-overlay]"));
    check(!document.querySelector("[data-review-evidence-overlay]"), "evidence overlay should be removable");

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
        { id: "other", conclusion: "已确认" },
        { id: "conflict", conclusion: "冲突" },
        { id: "pending", conclusion: "待修改" },
        { id: "blocking", conclusion: "阻塞" },
      ],
    });
    check(state()?.mode === "result", "matching result should enter result mode");
    check([...panel()?.querySelectorAll("[data-review-result]") || []].map((item) => item.getAttribute("data-result-id")).join(",") === "blocking,pending,conflict,other", "results should prioritize blocking, pending, then conflict");
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
