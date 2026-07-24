(function initPageDeliveryReview(globalObject, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (globalObject) globalObject.PageDeliveryReviewPanel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  const RESOLVED_CONCLUSIONS = new Set(["已确认", "不适用"]);
  const RESULT_PRIORITIES = new Map([
    ["阻塞", 0],
    ["待修改", 1],
    ["冲突", 2],
  ]);
  const PANEL_ITEM_ARTIFACT_FIELDS = new Set(["artifactPath", "artifactUrl"]);
  const SNAP_THRESHOLD = 48;
  const FALLBACK_PANEL_SIZE = { width: 320, height: 360 };
  let activeRuntime = null;

  function buildStorageKey(deliveryUnitKey) {
    return `page-delivery-review:v1:${deliveryUnitKey}`;
  }

  function clampPanelPosition(position = {}, panelSize = {}, viewportSize = {}) {
    const maxX = Math.max(0, nonNegativeFinite(viewportSize.width) - nonNegativeFinite(panelSize.width));
    const maxY = Math.max(0, nonNegativeFinite(viewportSize.height) - nonNegativeFinite(panelSize.height));

    return {
      x: clamp(nonNegativeFinite(position.x), 0, maxX),
      y: clamp(nonNegativeFinite(position.y), 0, maxY),
    };
  }

  function createReviewState(session) {
    if (
      !session ||
      typeof session !== "object" ||
      !isNonEmptyString(session.sessionId) ||
      !Array.isArray(session.cards)
    ) {
      throw new TypeError("Review session must include a cards array");
    }
    if (!session.cards.every(isCard)) {
      throw new TypeError("Review session must include valid cards");
    }

    const cards = selectRoundCards(session.cards, session.reviewRound).map(sanitizePanelItem);

    return {
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      deliveryUnitKey: session.deliveryUnitKey,
      deliveryUnitKind: session.deliveryUnitKind,
      artifactRuleFingerprint: session.artifactRuleFingerprint,
      reviewRound: session.reviewRound,
      planFingerprint: session.planFingerprint,
      cards,
      currentCardIndex: 0,
      mode: "input",
      submissionVersion: 0,
      lastSubmission: null,
      results: [],
      lastError: null,
    };
  }

  function reduceReviewState(state, action) {
    if (!isReviewState(state) || !action || typeof action !== "object") {
      return state;
    }

    if (state.mode === "input") {
      switch (action.type) {
        case "EDIT_CARD":
          return editCurrentCard(state, action.patch);
        case "NEXT":
          return moveCurrentCard(state, 1);
        case "PREVIOUS":
          return moveCurrentCard(state, -1);
        case "SUBMIT":
          return submit(state);
        default:
          return state;
      }
    }

    if (state.mode === "reviewing" && action.type === "APPLY_RESULT") {
      return applyResult(state, action);
    }

    if (state.mode === "result" && action.type === "CONFIRM_PLAN") {
      return { ...state, mode: "confirmed" };
    }

    return state;
  }

  function selectRoundCards(cards, reviewRound) {
    const validCards = Array.isArray(cards) ? cards.filter(isCard) : [];
    if (reviewRound <= 1) return validCards;
    return validCards.filter(
      (card) =>
        !RESOLVED_CONCLUSIONS.has(card.conclusion) ||
        card.reopened === true ||
        card.evidenceChanged === true,
    );
  }

  function mountReviewPanel(session, options = {}) {
    if (typeof document === "undefined" || !document?.body) {
      throw new Error("Review panel requires a browser document");
    }

    let state = createReviewState(session);
    const storageKey = buildStorageKey(state.deliveryUnitKey);
    const draft = readDraft(storageKey);
    state = restoreDraft(state, draft);

    if (activeRuntime) activeRuntime.destroy({ removeHost: false });

    const existingHosts = [...document.querySelectorAll("[data-page-delivery-review-host]")];
    const host = existingHosts.shift() || document.createElement("aside");
    existingHosts.forEach((node) => node.remove());
    host.setAttribute("data-page-delivery-review-host", "");
    if (!host.parentNode) document.body.append(host);

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
    const cleanups = [];
    const renderCleanups = [];
    let destroyed = false;
    let collapsed = draft?.collapsed === true;
    let panelPosition = initialPanelPosition(host, draft?.panelPosition);
    let drag = null;

    setHostPosition(host, panelPosition);

    const addListener = (target, type, listener, cleanupGroup = cleanups) => {
      target.addEventListener(type, listener);
      cleanupGroup.push(() => target.removeEventListener(type, listener));
    };
    const removeRenderListeners = () => {
      while (renderCleanups.length) renderCleanups.pop()();
    };
    const currentViewport = () => ({
      width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
    });
    const panelSize = () => {
      const rect = host.getBoundingClientRect();
      return {
        width: rect.width || FALLBACK_PANEL_SIZE.width,
        height: rect.height || FALLBACK_PANEL_SIZE.height,
      };
    };
    const saveDraft = () => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            cards: state.cards.map(({ id, conclusion, userNote }) => ({ id, conclusion, userNote })),
            collapsed,
            panelPosition,
          }),
        );
      } catch {
        // Storage may be unavailable or disabled; the panel remains usable.
      }
    };
    const updatePanelPosition = (position, snap = false) => {
      const size = panelSize();
      const viewport = currentViewport();
      panelPosition = clampPanelPosition(position, size, viewport);
      const maximumX = Math.max(0, viewport.width - size.width);
      if (snap && panelPosition.x <= SNAP_THRESHOLD) panelPosition.x = 0;
      if (snap && maximumX - panelPosition.x <= SNAP_THRESHOLD) panelPosition.x = maximumX;
      setHostPosition(host, panelPosition);
      saveDraft();
    };
    const runtimeState = () => ({
      ...deepClone(state),
      collapsed,
      panelPosition: { ...panelPosition },
    });
    const removeOverlay = () => {
      document.querySelectorAll("[data-review-evidence-overlay]").forEach((overlay) => overlay.remove());
    };
    const showEvidence = () => {
      removeOverlay();
      const card = state.cards[state.currentCardIndex];
      const selector = card?.evidence?.selector || options.evidenceSelector || "#login-form";
      let target;
      try {
        target = document.querySelector(selector);
      } catch {
        return;
      }
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const overlay = document.createElement("button");
      overlay.type = "button";
      overlay.setAttribute("data-review-evidence-overlay", "");
      overlay.setAttribute("aria-label", "关闭证据高亮");
      overlay.style.cssText = [
        "position:fixed",
        `left:${Math.max(0, rect.left)}px`,
        `top:${Math.max(0, rect.top)}px`,
        `width:${Math.max(1, rect.width)}px`,
        `height:${Math.max(1, rect.height)}px`,
        "z-index:2147483646",
        "border:3px solid #2563eb",
        "background:rgba(37,99,235,.12)",
        "cursor:pointer",
      ].join(";");
      addListener(overlay, "click", removeOverlay);
      document.body.append(overlay);
    };
    const dispatch = (action) => {
      const nextState = reduceReviewState(state, action);
      if (nextState === state) return state;
      state = nextState;
      saveDraft();
      render();
      return state;
    };
    const applyResultFromPage = (result) => dispatch({ type: "APPLY_RESULT", ...result });
    const confirmPlan = () => {
      const before = state;
      dispatch({ type: "CONFIRM_PLAN" });
      if (state === before || state.mode !== "confirmed") return;
      console.debug("PAGE_DELIVERY_PLAN_CONFIRM_REQUESTED", {
        sessionId: state.sessionId,
        submissionVersion: state.submissionVersion,
        planFingerprint: state.planFingerprint,
        artifactRuleFingerprint: state.artifactRuleFingerprint,
      });
    };
    const destroy = ({ removeHost = true } = {}) => {
      if (destroyed) return;
      destroyed = true;
      removeRenderListeners();
      while (cleanups.length) cleanups.pop()();
      removeOverlay();
      if (removeHost) host.remove();
      if (globalThis.__PAGE_DELIVERY_REVIEW__ === pageApi) {
        delete globalThis.__PAGE_DELIVERY_REVIEW__;
      }
      if (activeRuntime?.destroy === destroy) activeRuntime = null;
    };
    const pageApi = {
      getState: runtimeState,
      exportSubmission: () => state.lastSubmission,
      applyResult: applyResultFromPage,
      destroy,
    };
    const render = () => {
      removeRenderListeners();
      shadowRoot.replaceChildren();
      const style = document.createElement("style");
      style.textContent = panelCss();
      const shell = document.createElement("section");
      shell.setAttribute("data-review-panel", "");
      shell.innerHTML = panelMarkup(state, collapsed);
      shadowRoot.append(style, shell);

      const listen = (selector, type, listener) => {
        const target = shadowRoot.querySelector(selector);
        if (target) addListener(target, type, listener, renderCleanups);
      };
      listen('[data-action="toggle-collapse"]', "click", () => {
        collapsed = !collapsed;
        saveDraft();
        render();
      });
      listen('[data-action="previous"]', "click", () => dispatch({ type: "PREVIOUS" }));
      listen('[data-action="next"]', "click", () => dispatch({ type: "NEXT" }));
      listen('[data-action="highlight-evidence"]', "click", showEvidence);
      listen('[data-action="submit"]', "click", () => {
        const before = state;
        dispatch({ type: "SUBMIT" });
        if (state !== before && state.mode === "reviewing") {
          console.debug("PAGE_DELIVERY_REVIEW_SUBMITTED", {
            sessionId: state.sessionId,
            submissionVersion: state.submissionVersion,
          });
        }
      });
      listen('[data-action="confirm-plan"]', "click", confirmPlan);
      listen('[data-field="conclusion"]', "change", (event) =>
        dispatch({ type: "EDIT_CARD", patch: { conclusion: event.target.value } }),
      );
      listen('[data-field="userNote"]', "input", (event) =>
        dispatch({ type: "EDIT_CARD", patch: { userNote: event.target.value } }),
      );
      listen("[data-review-panel-titlebar]", "pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        drag = {
          pointerId: event.pointerId,
          offsetX: event.clientX - panelPosition.x,
          offsetY: event.clientY - panelPosition.y,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      });
    };

    addListener(document, "pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      updatePanelPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY });
    });
    addListener(document, "pointerup", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      updatePanelPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, true);
      drag = null;
    });
    addListener(window, "resize", () => updatePanelPosition(panelPosition));

    activeRuntime = { destroy };
    globalThis.__PAGE_DELIVERY_REVIEW__ = pageApi;
    render();
    return pageApi;
  }

  function initialPanelPosition(host, savedPosition) {
    const viewport = {
      width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
    };
    const rect = host.getBoundingClientRect();
    const panelSize = {
      width: rect.width || FALLBACK_PANEL_SIZE.width,
      height: rect.height || FALLBACK_PANEL_SIZE.height,
    };
    return clampPanelPosition(
      savedPosition || { x: viewport.width - panelSize.width - 20, y: 20 },
      panelSize,
      viewport,
    );
  }

  function setHostPosition(host, position) {
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("left", `${position.x}px`, "important");
    host.style.setProperty("top", `${position.y}px`, "important");
    host.style.setProperty("z-index", "2147483645", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("width", `${FALLBACK_PANEL_SIZE.width}px`, "important");
    host.style.setProperty("max-width", "calc(100vw - 16px)", "important");
  }

  function readDraft(storageKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function restoreDraft(state, draft) {
    if (!draft || !Array.isArray(draft.cards)) return state;
    const edits = new Map(
      draft.cards
        .filter((card) => card && typeof card === "object" && isNonEmptyString(card.id))
        .map((card) => [card.id, card]),
    );
    return {
      ...state,
      cards: state.cards.map((card) => {
        const saved = edits.get(card.id);
        if (!saved) return card;
        const patch = {};
        if (isNonEmptyString(saved.conclusion)) patch.conclusion = saved.conclusion;
        if (typeof saved.userNote === "string") patch.userNote = saved.userNote;
        return Object.keys(patch).length ? { ...deepClone(card), ...patch } : card;
      }),
    };
  }

  function panelCss() {
    return `
      :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; }
      * { box-sizing: border-box; }
      [data-review-panel] { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 12px 28px rgba(15, 23, 42, .22); overflow: hidden; }
      [data-review-panel-titlebar] { align-items: center; background: #0f172a; color: #fff; cursor: grab; display: flex; font-size: 14px; font-weight: 600; justify-content: space-between; min-height: 40px; padding: 0 10px; touch-action: none; }
      [data-review-panel-titlebar] button { cursor: pointer; }
      [data-review-body] { display: grid; gap: 10px; padding: 12px; }
      [data-review-card], [data-review-result] { border: 1px solid #e2e8f0; border-radius: 7px; padding: 10px; }
      label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; }
      textarea, select { font: inherit; min-width: 0; padding: 6px; }
      textarea { min-height: 64px; resize: vertical; }
      [data-review-actions], [data-review-navigation] { display: flex; flex-wrap: wrap; gap: 8px; }
      button { background: #fff; border: 1px solid #94a3b8; border-radius: 6px; color: #172033; font: inherit; padding: 6px 8px; }
      button[data-action="submit"], button[data-action="confirm-plan"] { background: #2563eb; border-color: #2563eb; color: #fff; }
      button:disabled { cursor: not-allowed; opacity: .55; }
      [data-review-result] { font-size: 13px; }
    `;
  }

  function panelMarkup(state, collapsed) {
    const currentCard = state.cards[state.currentCardIndex];
    const disabled = state.mode !== "input" ? " disabled" : "";
    const escape = escapeHtml;
    const header = `<header data-review-panel-titlebar><span>页面交付评审 ${state.currentCardIndex + 1}/${state.cards.length}</span><button type="button" data-action="toggle-collapse">${collapsed ? "展开" : "收起"}</button></header>`;
    if (collapsed) return header;
    if (state.mode === "result" || state.mode === "confirmed") {
      const results = state.results.map((result) => `<article data-review-result data-result-id="${escape(result.id)}"><strong>${escape(result.conclusion)}</strong> ${escape(result.id)}</article>`).join("");
      return `${header}<div data-review-body>${results || "<p>没有返回项</p>"}<div data-review-actions><button type="button" data-action="confirm-plan"${state.mode === "confirmed" ? " disabled" : ""}>确认更新 Plan</button></div></div>`;
    }
    const card = currentCard || { id: "", conclusion: "", userNote: "" };
    return `${header}<div data-review-body><article data-review-card data-card-id="${escape(card.id)}"><strong>${escape(card.id)}</strong><label>结论<select data-field="conclusion"${disabled}>${conclusionOptions(card.conclusion)}</select></label><label>备注<textarea data-field="userNote"${disabled}>${escape(card.userNote || "")}</textarea></label></article><div data-review-navigation><button type="button" data-action="previous"${disabled || state.currentCardIndex === 0 ? " disabled" : ""}>上一个</button><button type="button" data-action="next"${disabled || state.currentCardIndex >= state.cards.length - 1 ? " disabled" : ""}>下一个</button></div><div data-review-actions><button type="button" data-action="highlight-evidence"${disabled}>查看证据</button><button type="button" data-action="submit"${disabled}>统一提交</button></div>${state.mode === "reviewing" ? "<p>评审提交中</p>" : ""}</div>`;
  }

  function conclusionOptions(selected) {
    return ["已确认", "待修改", "阻塞", "冲突", "不适用"]
      .map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function editCurrentCard(state, patch) {
    const currentCard = state.cards[state.currentCardIndex];
    if (!currentCard || !patch || typeof patch !== "object") return state;

    const editablePatch = {};
    if (Object.hasOwn(patch, "conclusion") && isNonEmptyString(patch.conclusion)) {
      editablePatch.conclusion = patch.conclusion;
    }
    if (Object.hasOwn(patch, "userNote") && typeof patch.userNote === "string") {
      editablePatch.userNote = patch.userNote;
    }
    if (Object.keys(editablePatch).length === 0) return state;

    const cards = state.cards.slice();
    cards[state.currentCardIndex] = {
      ...deepClone(currentCard),
      ...editablePatch,
    };
    return { ...state, cards };
  }

  function moveCurrentCard(state, direction) {
    const lastCardIndex = Math.max(0, state.cards.length - 1);
    const currentCardIndex = clamp(state.currentCardIndex + direction, 0, lastCardIndex);
    if (currentCardIndex === state.currentCardIndex) return state;
    return {
      ...state,
      currentCardIndex,
    };
  }

  function submit(state) {
    const submissionVersion = state.submissionVersion + 1;
    const snapshot = deepFreeze({
      sessionId: state.sessionId,
      submissionVersion,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
      cards: state.cards.map(sanitizePanelItem),
    });

    return {
      ...state,
      mode: "reviewing",
      submissionVersion,
      lastSubmission: snapshot,
      lastError: null,
    };
  }

  function applyResult(state, action) {
    if (
      state.submissionVersion === 0 ||
      !isNonEmptyString(action.sessionId) ||
      action.sessionId !== state.sessionId ||
      action.submissionVersion !== state.submissionVersion
    ) {
      return { ...state, lastError: "Stale review result ignored" };
    }

    if (!Array.isArray(action.results)) {
      return { ...state, lastError: "Invalid review results" };
    }
    if (!action.results.every(isResult)) {
      return { ...state, lastError: "Invalid review results" };
    }

    return {
      ...state,
      mode: "result",
      results: action.results.map(sanitizePanelItem).sort(compareResults),
      lastError: null,
    };
  }

  function compareResults(left, right) {
    return resultPriority(left) - resultPriority(right);
  }

  function resultPriority(result) {
    return RESULT_PRIORITIES.get(result.conclusion) ?? 3;
  }

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .map(([key, nestedValue]) => [key, deepClone(nestedValue)]),
      );
    }
    return value;
  }

  function sanitizePanelItem(item) {
    const sanitized = deepClone(item);
    for (const field of PANEL_ITEM_ARTIFACT_FIELDS) {
      delete sanitized[field];
    }
    return sanitized;
  }

  function isReviewState(state) {
    return (
      state &&
      typeof state === "object" &&
      ["input", "reviewing", "result", "confirmed"].includes(state.mode) &&
      Array.isArray(state.cards) &&
      Number.isInteger(state.currentCardIndex)
    );
  }

  function isNormalizedObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function hasReviewIdentity(value) {
    return (
      isNormalizedObject(value) &&
      isNonEmptyString(value.id) &&
      isNonEmptyString(value.conclusion)
    );
  }

  function isCard(value) {
    return hasReviewIdentity(value);
  }

  function isResult(value) {
    return hasReviewIdentity(value);
  }

  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }

  function nonNegativeFinite(value) {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  return {
    buildStorageKey,
    clampPanelPosition,
    createReviewState,
    reduceReviewState,
    selectRoundCards,
    mountReviewPanel,
  };
});
