(function initPageDeliveryReview(globalObject, factory) {
  if (globalObject?.__PAGE_DELIVERY_REVIEW__?.destroy) {
    try {
      globalObject.__PAGE_DELIVERY_REVIEW__.destroy();
    } catch {
      // A stale page-global must not prevent a fresh injected panel from mounting.
    }
  }
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
  const RESULT_CONCLUSIONS = new Set(["已确认", "待修改", "阻塞", "冲突", "不适用"]);
  const LINK_FIELDS = ["features", "apis", "uiStates", "dependencies", "tasks", "evidence"];
  const USER_CONCLUSIONS = new Set(["未评审", "已确认", "待修改", "阻塞", "不适用"]);
  const SNAP_THRESHOLD = 48;
  const FALLBACK_PANEL_SIZE = { width: 320, height: 360 };
  const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
  const memoryDrafts = new Map();
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
    const normalized = normalizeReviewSession(session);
    const cards = selectReviewCards(normalized.cards, normalized.reviewRound, normalized.viewScope);

    return {
      ...normalized,
      cards,
      currentCardIndex: 0,
      currentResultIndex: 0,
      mode: "input",
      submissionVersion: 0,
      lastSubmission: null,
      results: [],
      lastError: null,
    };
  }

  function normalizeReviewSession(session) {
    if (!isNormalizedObject(session) || !Array.isArray(session.cards) || !isNonEmptyString(session.sessionId)) {
      throw createCodedError(TypeError, "invalid-review-session", "ReviewSession must include a sessionId and cards array");
    }
    if (session.schemaVersion !== 1) {
      throw createCodedError(TypeError, "invalid-review-schema-version", "ReviewSession schemaVersion must be 1");
    }
    if (!isDeliveryUnitKey(session.deliveryUnitKey)) {
      throw createCodedError(TypeError, "invalid-delivery-unit-key", "ReviewSession deliveryUnitKey must be a safe relative key");
    }
    if (!["page", "module"].includes(session.deliveryUnitKind)) {
      throw createCodedError(TypeError, "invalid-delivery-unit-kind", "ReviewSession deliveryUnitKind must be page or module");
    }
    if (!isFingerprint(session.planFingerprint) || !isFingerprint(session.artifactRuleFingerprint)) {
      throw createCodedError(TypeError, "invalid-review-fingerprint", "ReviewSession fingerprints must be sha256 values");
    }
    if (!Number.isInteger(session.reviewRound) || session.reviewRound < 1) {
      throw createCodedError(TypeError, "invalid-review-round", "ReviewSession reviewRound must be a positive integer");
    }
    if (
      session.submissionVersion !== 0 ||
      session.mode !== "input" ||
      session.currentCardIndex !== 0 ||
      !["round", "all"].includes(session.viewScope)
    ) {
      throw createCodedError(TypeError, "invalid-review-session", "ReviewSession must start in canonical input state");
    }
    const artifactRuleResolution = canonicalizeArtifactRuleResolution(session.artifactRuleResolution);
    if (!artifactRuleResolution) {
      throw createCodedError(TypeError, "invalid-artifact-rule-resolution", "Artifact rule resolution is invalid");
    }
    if (!isReviewableArtifactRuleResolution(artifactRuleResolution, session.artifactRuleFingerprint)) {
      throw createCodedError(
        TypeError,
        "artifact-rule-confirmation-required",
        "Artifact rule candidate must be explicitly confirmed for the current fingerprint before review",
      );
    }
    const cards = session.cards.map(normalizeReviewCard);
    const ids = new Set();
    for (const card of cards) {
      if (ids.has(card.id)) {
        throw createCodedError(TypeError, "duplicate-review-card-id", `Duplicate review card id: ${card.id}`);
      }
      ids.add(card.id);
    }
    return {
      schemaVersion: 1,
      sessionId: session.sessionId,
      deliveryUnitKey: session.deliveryUnitKey,
      deliveryUnitKind: session.deliveryUnitKind,
      artifactRuleFingerprint: session.artifactRuleFingerprint,
      artifactRuleResolution,
      reviewRound: session.reviewRound,
      planFingerprint: session.planFingerprint,
      submissionVersion: 0,
      mode: "input",
      currentCardIndex: 0,
      viewScope: session.viewScope,
      cards,
    };
  }

  function normalizeReviewCard(card) {
    const valid = (
      isNormalizedObject(card) &&
      isNonEmptyString(card.id) &&
      isNonEmptyString(card.dimension) &&
      isNormalizedObject(card.links) &&
      LINK_FIELDS.every((field) => isStringArray(card.links[field])) &&
      Array.isArray(card.sourceEvidence) &&
      card.sourceEvidence.every(isSourceEvidence) &&
      isNonEmptyString(card.reviewGoal) &&
      isNonEmptyString(card.design) &&
      isNonEmptyString(card.regionAndComponents) &&
      isStringArray(card.interactionStates) &&
      isStringArray(card.relatedApis) &&
      isStringArray(card.mockScenarios) &&
      isStringArray(card.acceptanceCriteria) &&
      USER_CONCLUSIONS.has(card.conclusion) &&
      typeof card.userNote === "string" &&
      (card.reviewResult === null || isNormalizedObject(card.reviewResult)) &&
      typeof card.reopened === "boolean" &&
      typeof card.evidenceChanged === "boolean" &&
      (card.telepath === undefined || typeof card.telepath === "string")
    );
    if (!valid) {
      throw createCodedError(TypeError, "invalid-review-card", "Review cards must follow the approved canonical schema");
    }
    return {
      id: card.id,
      dimension: card.dimension,
      links: Object.fromEntries(LINK_FIELDS.map((field) => [field, [...card.links[field]]])),
      sourceEvidence: card.sourceEvidence.map(normalizeSourceEvidence),
      reviewGoal: card.reviewGoal,
      design: card.design,
      regionAndComponents: card.regionAndComponents,
      interactionStates: [...card.interactionStates],
      relatedApis: [...card.relatedApis],
      mockScenarios: [...card.mockScenarios],
      acceptanceCriteria: [...card.acceptanceCriteria],
      conclusion: card.conclusion,
      userNote: card.userNote,
      reviewResult: card.reviewResult === null ? null : normalizeEmbeddedReviewResult(card.reviewResult),
      reopened: card.reopened,
      evidenceChanged: card.evidenceChanged,
      ...(card.telepath !== undefined ? { telepath: card.telepath } : {}),
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

    if (state.mode === "result") {
      if (action.type === "NEXT") return moveCurrentResult(state, 1);
      if (action.type === "PREVIOUS") return moveCurrentResult(state, -1);
      if (
        action.type === "REQUEST_PLAN_CONFIRMATION" &&
        state.results.length > 0 &&
        state.currentResultIndex === state.results.length - 1
      ) {
        const resolutionError = assertArtifactLocationRule(
          {
            ...state.artifactRuleResolution,
            ruleFingerprint: state.artifactRuleFingerprint,
          },
          state.artifactRuleFingerprint,
        );
        return { ...state, lastError: resolutionError };
      }
      if (
        action.type === "CONFIRM_PLAN" &&
        state.results.length > 0 &&
        state.currentResultIndex === state.results.length - 1
      ) {
        const fingerprintError = assertCurrentFingerprints(state, action);
        if (fingerprintError) return { ...state, lastError: fingerprintError };
        const resolutionError = assertArtifactLocationRule(
          {
            ...state.artifactRuleResolution,
            ruleFingerprint: state.artifactRuleFingerprint,
          },
          action.artifactRuleFingerprint,
        );
        if (resolutionError) return { ...state, lastError: resolutionError };
        return { ...state, mode: "confirmed" };
      }
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

  function selectReviewCards(cards, reviewRound, viewScope) {
    const selected = viewScope === "all"
      ? (Array.isArray(cards) ? cards.filter(isCard) : [])
      : selectRoundCards(cards, reviewRound);
    return selected.map((card) => (
      card.evidenceChanged === true && RESOLVED_CONCLUSIONS.has(card.conclusion)
        ? {
            ...deepClone(card),
            reviewResult: {
              ...(card.reviewResult || {}),
              previousConclusion: card.reviewResult?.previousConclusion || card.conclusion,
            },
          }
        : card
    ));
  }

  function mountReviewPanel(session, options = {}) {
    let state = createReviewState(session);
    if (typeof document === "undefined" || !document?.body) {
      throw createCodedError(Error, "browser-document-unavailable", "Review panel requires a browser document");
    }

    const previousApi = globalThis.__PAGE_DELIVERY_REVIEW__;
    if (previousApi?.destroy) previousApi.destroy({ removeHost: false });

    const storageKey = buildStorageKey(state.deliveryUnitKey);
    const now = Date.now();
    const rawDraft = loadDraft(storageKey);
    const validatedDraft = isFreshMatchingDraft(state, rawDraft, now) ? rawDraft : null;
    const safeUiDraft = isFreshSafeUiDraft(state, rawDraft, now) ? rawDraft : validatedDraft;
    state = restoreDraft(state, validatedDraft, now);

    if (activeRuntime) activeRuntime.destroy({ removeHost: false });

    const existingHosts = [...document.querySelectorAll("[data-page-delivery-review-host]")];
    const host = existingHosts.shift() || document.createElement("aside");
    existingHosts.forEach((node) => node.remove());
    host.setAttribute("data-page-delivery-review-host", "");
    if (!host.parentNode) document.body.append(host);

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
    const cleanups = createCleanupRegistry();
    const renderCleanups = createCleanupRegistry();
    let destroyed = false;
    let collapsed = safeUiDraft?.collapsed === true;
    let panelPosition = initialPanelPosition(host, safeUiDraft?.panelPosition);
    let drag = null;
    let evidenceStatus = null;
    const confirmationGate = createPlanConfirmationGate();

    setHostPosition(host, panelPosition);

    const addListener = (target, type, listener, cleanupGroup = cleanups) => cleanupGroup.add(target, type, listener);
    const removeRenderListeners = () => renderCleanups.cleanup();
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
    const persistDraft = () => saveDraft(storageKey, {
      deliveryUnitKey: state.deliveryUnitKey,
      sessionId: state.sessionId,
      reviewRound: state.reviewRound,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
      artifactRuleResolution: state.artifactRuleResolution,
      savedAt: Date.now(),
      cards: state.cards.map(({ id, conclusion, userNote }) => ({ id, conclusion, userNote })),
      currentCardIndex: state.currentCardIndex,
      collapsed,
      panelPosition,
    });
    const updatePanelPosition = (position, snap = false) => {
      const size = panelSize();
      const viewport = currentViewport();
      panelPosition = clampPanelPosition(position, size, viewport);
      const maximumX = Math.max(0, viewport.width - size.width);
      if (snap && panelPosition.x <= SNAP_THRESHOLD) panelPosition.x = 0;
      if (snap && maximumX - panelPosition.x <= SNAP_THRESHOLD) panelPosition.x = maximumX;
      setHostPosition(host, panelPosition);
      persistDraft();
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
      evidenceStatus = highlightEvidence(
        document,
        card?.sourceEvidence?.find((item) => isNonEmptyString(item.selector)) ||
          { selector: options.evidenceSelector },
        addListener,
        removeOverlay,
      );
      if (evidenceStatus) render();
    };
    const dispatch = (action) => {
      const nextState = reduceReviewState(state, action);
      if (nextState === state) return state;
      state = nextState;
      persistDraft();
      render();
      return state;
    };
    const setRuntimeError = (error) => {
      state = { ...state, lastError: error };
      persistDraft();
      render();
      return state;
    };
    const applyResultFromPage = (result) => {
      confirmationGate.invalidate();
      return dispatch({ type: "APPLY_RESULT", ...result });
    };
    const confirmPlan = (fingerprints) => {
      const confirmationError = confirmationGate.consume(state, fingerprints || {});
      if (confirmationError) return setRuntimeError(confirmationError);
      return dispatch({ type: "CONFIRM_PLAN", ...fingerprints });
    };
    const requestPlanConfirmation = (event) => {
      const requestError = confirmationGate.request(state, event);
      if (requestError) {
        if (requestError.code !== "untrusted-confirmation-request") setRuntimeError(requestError);
        return;
      }
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
      cleanups.cleanup();
      removeOverlay();
      confirmationGate.destroy();
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
      confirmPlan,
      destroy,
    };
    const render = () => {
      removeRenderListeners();
      shadowRoot.replaceChildren();
      const style = document.createElement("style");
      style.textContent = panelCss();
      const shell = document.createElement("section");
      shell.setAttribute("data-review-panel", "");
      shell.innerHTML = panelMarkup(state, collapsed, evidenceStatus);
      shadowRoot.append(style, shell);

      const listen = (selector, type, listener) => {
        const target = shadowRoot.querySelector(selector);
        if (target) addListener(target, type, listener, renderCleanups);
      };
      listen('[data-action="toggle-collapse"]', "click", () => {
        collapsed = !collapsed;
        persistDraft();
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
      listen('[data-action="confirm-plan"]', "click", requestPlanConfirmation);
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
    host.style.setProperty("max-height", "calc(100vh - 16px)", "important");
  }

  function sanitizeDraft(draft) {
    if (!isNormalizedObject(draft)) return null;
    const artifactRuleResolution = canonicalizeArtifactRuleResolution(draft.artifactRuleResolution);
    const cards = Array.isArray(draft.cards)
      ? draft.cards
        .filter((card) => isNormalizedObject(card) && isNonEmptyString(card.id))
        .map((card) => ({
          id: card.id,
          ...(USER_CONCLUSIONS.has(card.conclusion) ? { conclusion: card.conclusion } : {}),
          ...(typeof card.userNote === "string" ? { userNote: card.userNote } : {}),
        }))
      : [];
    return {
      ...(isNonEmptyString(draft.deliveryUnitKey) ? { deliveryUnitKey: draft.deliveryUnitKey } : {}),
      ...(isNonEmptyString(draft.sessionId) ? { sessionId: draft.sessionId } : {}),
      ...(Number.isInteger(draft.reviewRound) ? { reviewRound: draft.reviewRound } : {}),
      ...(isNonEmptyString(draft.planFingerprint) ? { planFingerprint: draft.planFingerprint } : {}),
      ...(isNonEmptyString(draft.artifactRuleFingerprint) ? { artifactRuleFingerprint: draft.artifactRuleFingerprint } : {}),
      ...(artifactRuleResolution ? { artifactRuleResolution } : {}),
      ...(Number.isFinite(draft.savedAt) ? { savedAt: draft.savedAt } : {}),
      cards,
      ...(Number.isInteger(draft.currentCardIndex) ? { currentCardIndex: draft.currentCardIndex } : {}),
      ...(draft.collapsed === true ? { collapsed: true } : {}),
      ...(isNormalizedObject(draft.panelPosition) ? {
        panelPosition: {
          x: nonNegativeFinite(draft.panelPosition.x),
          y: nonNegativeFinite(draft.panelPosition.y),
        },
      } : {}),
    };
  }

  function resolveStorage(storage) {
    if (storage) return storage;
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }

  function loadDraft(storageKey, storage, now = Date.now()) {
    const resolvedStorage = resolveStorage(storage);
    try {
      const raw = resolvedStorage?.getItem(storageKey);
      const draft = typeof raw === "string" ? sanitizeDraft(JSON.parse(raw)) : null;
      if (draft) {
        if (!isFreshDraft(draft, now)) {
          memoryDrafts.delete(storageKey);
          try { resolvedStorage?.removeItem(storageKey); } catch {}
          return null;
        }
        memoryDrafts.set(storageKey, deepClone(draft));
        return draft;
      }
    } catch {
      // The in-memory draft is the safe fallback when storage is unavailable.
    }
    const memoryDraft = memoryDrafts.get(storageKey);
    if (!memoryDraft) return null;
    if (!isFreshDraft(memoryDraft, now)) {
      memoryDrafts.delete(storageKey);
      return null;
    }
    return deepClone(memoryDraft);
  }

  function saveDraft(storageKey, draft, storage) {
    const sanitized = sanitizeDraft(draft);
    if (!sanitized) return null;
    memoryDrafts.set(storageKey, deepClone(sanitized));
    try {
      resolveStorage(storage)?.setItem(storageKey, JSON.stringify(sanitized));
    } catch {
      // The panel can continue using the in-memory copy.
    }
    return sanitized;
  }

  function restoreDraft(state, draft, now = Date.now()) {
    if (!isFreshMatchingDraft(state, draft, now)) return state;
    const edits = new Map(
      draft.cards
        .filter((card) => card && typeof card === "object" && isNonEmptyString(card.id))
        .map((card) => [card.id, card]),
    );
    const currentCardIndex = Number.isInteger(draft.currentCardIndex)
      ? clamp(draft.currentCardIndex, 0, Math.max(0, state.cards.length - 1))
      : state.currentCardIndex;
    return {
      ...state,
      currentCardIndex,
      cards: state.cards.map((card) => {
        const saved = edits.get(card.id);
        if (!saved) return card;
        const patch = {};
        if (USER_CONCLUSIONS.has(saved.conclusion)) patch.conclusion = saved.conclusion;
        if (typeof saved.userNote === "string") patch.userNote = saved.userNote;
        return Object.keys(patch).length ? { ...deepClone(card), ...patch } : card;
      }),
    };
  }

  function isFreshMatchingDraft(state, draft, now) {
    if (!draft || !Array.isArray(draft.cards) || !isFreshDraft(draft, now)) return false;
    const draftArtifactRuleResolution = canonicalizeArtifactRuleResolution(draft.artifactRuleResolution);
    return (
      draft.sessionId === state.sessionId &&
      draft.reviewRound === state.reviewRound &&
      draft.planFingerprint === state.planFingerprint &&
      draft.artifactRuleFingerprint === state.artifactRuleFingerprint &&
      draftArtifactRuleResolution?.status === state.artifactRuleResolution.status &&
      draftArtifactRuleResolution?.source === state.artifactRuleResolution.source &&
      draftArtifactRuleResolution?.confirmedRuleFingerprint ===
        state.artifactRuleResolution.confirmedRuleFingerprint
    );
  }

  function isFreshDraft(draft, now) {
    return Number.isFinite(draft?.savedAt) && draft.savedAt <= now && now - draft.savedAt <= DRAFT_TTL_MS;
  }

  function isFreshSafeUiDraft(state, draft, now) {
    return Boolean(
      draft &&
      Number.isFinite(draft.savedAt) &&
      draft.savedAt <= now &&
      now - draft.savedAt <= DRAFT_TTL_MS &&
      draft.deliveryUnitKey === state.deliveryUnitKey &&
      draft.planFingerprint !== state.planFingerprint,
    );
  }

  function createCleanupRegistry() {
    const cleanups = [];
    return {
      add(target, type, listener) {
        target.addEventListener(type, listener);
        cleanups.push(() => target.removeEventListener(type, listener));
        return listener;
      },
      cleanup() {
        while (cleanups.length) cleanups.pop()();
      },
    };
  }

  function highlightEvidence(documentObject, evidence, addListener, removeOverlay) {
    const unavailable = () => reviewError("evidence-unavailable", "无法定位证据，请检查选择器或跨域 frame 访问权限。");
    if (!isNormalizedObject(evidence) || !isNonEmptyString(evidence.selector)) return unavailable();
    let root = documentObject;
    let frameOffset = { x: 0, y: 0 };
    try {
      if (isNonEmptyString(evidence.frameSelector)) {
        const frame = documentObject.querySelector(evidence.frameSelector);
        root = frame?.contentDocument;
        const frameRect = frame?.getBoundingClientRect?.();
        frameOffset = {
          x: (frameRect?.left || 0) + (frame?.clientLeft || 0),
          y: (frameRect?.top || 0) + (frame?.clientTop || 0),
        };
      }
      const target = root?.querySelector(evidence.selector);
      if (!target) return unavailable();
      const rect = target.getBoundingClientRect();
      const overlay = documentObject.createElement("button");
      overlay.type = "button";
      overlay.setAttribute("data-review-evidence-overlay", "");
      overlay.setAttribute("aria-label", "关闭证据高亮");
      overlay.style.cssText = [
        "position:fixed",
        `left:${Math.max(0, frameOffset.x + rect.left)}px`,
        `top:${Math.max(0, frameOffset.y + rect.top)}px`,
        `width:${Math.max(1, rect.width)}px`,
        `height:${Math.max(1, rect.height)}px`,
        "z-index:2147483646",
        "border:3px solid #2563eb",
        "background:rgba(37,99,235,.12)",
        "cursor:pointer",
      ].join(";");
      addListener(overlay, "click", removeOverlay);
      documentObject.body.append(overlay);
      return null;
    } catch {
      return unavailable();
    }
  }

  function panelCss() {
    return `
      :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; }
      * { box-sizing: border-box; }
      [data-review-panel] { background: #fff !important; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 12px 28px rgba(15, 23, 42, .22); color: #172033 !important; display: flex; flex-direction: column; max-height: calc(100vh - 16px); overflow: hidden; }
      [data-review-panel-titlebar] { align-items: center; background: #0f172a; color: #fff; cursor: grab; display: flex; font-size: 14px; font-weight: 600; justify-content: space-between; min-height: 40px; padding: 0 10px; touch-action: none; }
      [data-review-panel-titlebar] button { cursor: pointer; }
      [data-review-body] { display: grid; gap: 10px; max-height: calc(100vh - 56px); min-height: 0; overflow-y: auto; padding: 12px; }
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

  function panelMarkup(state, collapsed, evidenceStatus) {
    const currentCard = state.cards[state.currentCardIndex];
    const isResultMode = state.mode === "result" || state.mode === "confirmed";
    const currentResult = isResultMode ? state.results[state.currentResultIndex] : null;
    const disabled = state.mode !== "input" ? " disabled" : "";
    const escape = escapeHtml;
    const reviewDomain = (isResultMode ? currentResult?.dimension : currentCard?.dimension) || "未分类";
    const sessionCount = state.cards.length;
    const objectiveCount = state.cards.length;
    const contextIndex = isResultMode ? state.currentResultIndex + 1 : state.currentCardIndex + 1;
    const contextLength = isResultMode ? state.results.length : state.cards.length;
    const displayIndex = contextLength === 0 ? 0 : contextIndex;
    const header = `<header data-review-panel-titlebar><span data-review-context>${escape(reviewDomain)} · ${displayIndex}/${contextLength} · 会话 ${sessionCount} · 目标 ${objectiveCount}</span><button type="button" data-action="toggle-collapse">${collapsed ? "展开" : "收起"}</button></header>`;
    if (collapsed) return header;
    const errorMarkup = state.lastError ? `<p data-review-error>${escape(state.lastError.message)}</p>` : "";
    const evidenceMarkup = evidenceStatus ? `<p data-review-evidence-status>${escape(evidenceStatus.message)}</p>` : "";
    if (!isResultMode && state.cards.length === 0) {
      return `${header}<div data-review-body>${errorMarkup}${evidenceMarkup}<p data-review-empty>本轮没有需要评审的卡片</p></div>`;
    }
    if (state.mode === "result" || state.mode === "confirmed") {
      const result = currentResult;
      const lastResult = state.currentResultIndex >= state.results.length - 1;
      const confirmationError = assertArtifactLocationRule(
        {
          ...state.artifactRuleResolution,
          ruleFingerprint: state.artifactRuleFingerprint,
        },
        state.artifactRuleFingerprint,
      );
      const resultMarkup = result
        ? `<article data-review-result data-result-id="${escape(result.id)}"><strong>${escape(result.conclusion)}</strong> ${escape(result.id)}${result.summary ? `<p data-result-summary>${escape(result.summary)}</p>` : ""}${result.planChangeSummary ? `<p data-result-plan-change-summary>${escape(result.planChangeSummary)}</p>` : ""}</article>`
        : "<p>没有返回项</p>";
      const confirmationMarkup = lastResult
        ? `<div data-review-actions><button type="button" data-action="confirm-plan"${state.mode === "confirmed" || confirmationError ? " disabled" : ""}>确认更新 Plan</button>${confirmationError ? `<p data-review-confirm-blocked>${escape(confirmationError.message)}</p>` : ""}</div>`
        : "";
      return `${header}<div data-review-body>${errorMarkup}${evidenceMarkup}${resultMarkup}<div data-review-navigation><button type="button" data-action="previous"${state.currentResultIndex === 0 ? " disabled" : ""}>上一个</button><button type="button" data-action="next"${lastResult ? " disabled" : ""}>下一个</button></div>${confirmationMarkup}</div>`;
    }
    const card = currentCard || { id: "", conclusion: "", userNote: "" };
    const lastCard = state.currentCardIndex >= state.cards.length - 1;
    return `${header}<div data-review-body>${errorMarkup}${evidenceMarkup}<article data-review-card data-card-id="${escape(card.id)}"><strong>${escape(card.id)}</strong>${cardFieldsMarkup(card)}<label>结论<select data-field="conclusion"${disabled}>${conclusionOptions(card.conclusion)}</select></label><label>备注<textarea data-field="userNote"${disabled}>${escape(card.userNote || "")}</textarea></label></article><div data-review-navigation><button type="button" data-action="previous"${disabled || state.currentCardIndex === 0 ? " disabled" : ""}>上一个</button><button type="button" data-action="next"${disabled || lastCard ? " disabled" : ""}>下一个</button></div><div data-review-actions><button type="button" data-action="highlight-evidence"${disabled}>查看证据</button>${lastCard ? `<button type="button" data-action="submit"${disabled}>统一提交评审</button>` : ""}</div>${state.mode === "reviewing" ? "<p>评审提交中</p>" : ""}</div>`;
  }

  function conclusionOptions(selected) {
    return ["未评审", "已确认", "待修改", "阻塞", "不适用"]
      .map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`)
      .join("");
  }

  function cardFieldsMarkup(card) {
    const fields = [
      ["dimension", "评审域"],
      ["links", "关联"],
      ["sourceEvidence", "来源证据"],
      ["reviewGoal", "评审目标"],
      ["design", "设计"],
      ["regionAndComponents", "页面区域、布局和组件"],
      ["interactionStates", "交互状态"],
      ["relatedApis", "关联接口"],
      ["mockScenarios", "模拟场景"],
      ["acceptanceCriteria", "验收标准"],
    ];
    const markup = fields
      .filter(([field]) => card[field] !== undefined && card[field] !== null)
      .map(([field, label]) => `<p data-card-field="${field}"><strong>${label}</strong> ${escapeHtml(formatFieldValue(card[field]))}</p>`)
      .join("");
    return markup;
  }

  function formatFieldValue(value) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(formatFieldValue).join("；");
    if (value && typeof value === "object") {
      return Object.entries(value).map(([key, item]) => `${key}: ${formatFieldValue(item)}`).join("；");
    }
    return "";
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
    if (Object.hasOwn(patch, "conclusion") && USER_CONCLUSIONS.has(patch.conclusion)) {
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

  function moveCurrentResult(state, direction) {
    const lastResultIndex = Math.max(0, state.results.length - 1);
    const currentResultIndex = clamp(state.currentResultIndex + direction, 0, lastResultIndex);
    if (currentResultIndex === state.currentResultIndex) return state;
    return { ...state, currentResultIndex };
  }

  function submit(state) {
    if (state.cards.length === 0) {
      return { ...state, lastError: reviewError("no-active-cards", "没有可提交的本轮评审卡。") };
    }
    const submissionVersion = state.submissionVersion + 1;
    const snapshot = deepFreeze({
      sessionId: state.sessionId,
      submissionVersion,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
      artifactRuleResolution: deepClone(state.artifactRuleResolution),
      cards: state.cards.map(deepClone),
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
      return { ...state, lastError: reviewError("stale-result", "已忽略过期的评审结果。") };
    }

    const fingerprintError = assertCurrentFingerprints(state, action);
    if (fingerprintError) return { ...state, lastError: fingerprintError };

    if (!Array.isArray(action.results)) {
      return { ...state, lastError: reviewError("invalid-results", "评审结果格式无效。") };
    }
    if (action.results.length === 0) {
      return { ...state, lastError: reviewError("empty-results", "空评审结果不能确认更新 Plan。") };
    }
    let results;
    try {
      results = action.results.map(normalizeReviewResult);
    } catch {
      return { ...state, lastError: reviewError("invalid-results", "评审结果格式无效。") };
    }

    return {
      ...state,
      mode: "result",
      results: prioritizeReviewResults(results),
      currentResultIndex: 0,
      lastError: null,
    };
  }

  function prioritizeReviewResults(results) {
    return [...results].sort((left, right) => {
      const priority = resultPriority(left) - resultPriority(right);
      return priority || String(left.id).localeCompare(String(right.id), "en");
    });
  }

  function resultPriority(result) {
    return RESULT_PRIORITIES.get(result.conclusion) ?? 3;
  }

  function normalizeReviewResult(result) {
    if (
      !isNormalizedObject(result) ||
      !isNonEmptyString(result.id) ||
      !RESULT_CONCLUSIONS.has(result.conclusion)
    ) {
      throw createCodedError(TypeError, "invalid-review-result", "Review result is invalid");
    }
    const dimension = result.dimension ?? result.reviewDomain ?? "评审结果";
    if (!isNonEmptyString(dimension)) {
      throw createCodedError(TypeError, "invalid-review-result", "Review result dimension is invalid");
    }
    const sourceEvidence = Array.isArray(result.sourceEvidence)
      ? result.sourceEvidence
      : (isNormalizedObject(result.evidence)
        ? [{
            id: `${result.id}-EVIDENCE`,
            kind: "review-result",
            label: result.id,
            ...result.evidence,
          }]
        : []);
    if (!sourceEvidence.every(isSourceEvidence)) {
      throw createCodedError(TypeError, "invalid-review-result", "Review result evidence is invalid");
    }
    return {
      id: result.id,
      conclusion: result.conclusion,
      dimension,
      ...(typeof result.summary === "string" ? { summary: result.summary } : {}),
      ...(typeof result.planChangeSummary === "string" ? { planChangeSummary: result.planChangeSummary } : {}),
      sourceEvidence: sourceEvidence.map(normalizeSourceEvidence),
      ...(typeof result.telepath === "string" ? { telepath: result.telepath } : {}),
    };
  }

  function reviewError(code, message) {
    return { code, message };
  }

  function createCodedError(ErrorType, code, message) {
    const error = new ErrorType(message);
    error.code = code;
    return error;
  }

  function assertPlanFingerprint(expected, actual) {
    return expected === actual
      ? null
      : reviewError("plan-conflict", "Plan 已变化，请重新解析后再确认更新。");
  }

  function assertCurrentFingerprints(state, action) {
    if (!isNonEmptyString(action.planFingerprint)) {
      return reviewError("missing-plan-fingerprint", "缺少当前 Plan 指纹，无法继续确认。");
    }
    if (!isNonEmptyString(action.artifactRuleFingerprint)) {
      return reviewError("missing-artifact-rule-fingerprint", "缺少当前产物位置规则指纹，无法继续确认。");
    }
    return assertPlanFingerprint(state.planFingerprint, action.planFingerprint) || (
      state.artifactRuleFingerprint === action.artifactRuleFingerprint
        ? null
        : reviewError("artifact-rule-conflict", "产物位置规则已变化，请重新解析适用的 AGENTS.md 后再提交。")
    );
  }

  function assertArtifactLocationRule(rule, currentRuleFingerprint) {
    if (
      !isNormalizedObject(rule) ||
      rule.status !== "resolved" ||
      rule.source !== "agents"
    ) {
      return reviewError(
        "artifact-rule-unresolved",
        "产物位置规则尚未由适用的 AGENTS.md 确认并固化，无法确认更新 Plan。",
      );
    }
    return (
      !isNonEmptyString(rule.ruleFingerprint) ||
      rule.ruleFingerprint !== currentRuleFingerprint
    )
      ? reviewError("artifact-rule-conflict", "产物位置规则已变化，请重新解析适用的 AGENTS.md 后再提交。")
      : null;
  }

  function createPlanConfirmationGate() {
    let pending = null;
    let destroyed = false;
    const identity = (state) => ({
      sessionId: state.sessionId,
      submissionVersion: state.submissionVersion,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
    });
    const sameIdentity = (left, right) => (
      left.sessionId === right.sessionId &&
      left.submissionVersion === right.submissionVersion &&
      left.planFingerprint === right.planFingerprint &&
      left.artifactRuleFingerprint === right.artifactRuleFingerprint
    );
    return {
      request(state, event) {
        if (destroyed || event?.isTrusted !== true) {
          return reviewError("untrusted-confirmation-request", "确认更新 Plan 必须来自真实用户交互。");
        }
        if (
          state.mode !== "result" ||
          state.results.length === 0 ||
          state.currentResultIndex !== state.results.length - 1
        ) {
          return reviewError("confirmation-request-unavailable", "当前不是可请求确认的最终评审结果。");
        }
        const resolutionError = assertArtifactLocationRule(
          { ...state.artifactRuleResolution, ruleFingerprint: state.artifactRuleFingerprint },
          state.artifactRuleFingerprint,
        );
        if (resolutionError) return resolutionError;
        pending = identity(state);
        return null;
      },
      consume(state, fingerprints) {
        if (destroyed || !pending) {
          return reviewError("confirmation-request-required", "请先通过面板中的真实用户操作请求确认更新 Plan。");
        }
        const request = pending;
        pending = null;
        if (!sameIdentity(request, identity(state))) {
          return reviewError("stale-confirmation-request", "确认请求已过期，请重新发起。");
        }
        return assertCurrentFingerprints(state, fingerprints);
      },
      invalidate() {
        pending = null;
      },
      destroy() {
        pending = null;
        destroyed = true;
      },
    };
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

  function isReviewState(state) {
    return (
      state &&
      typeof state === "object" &&
      ["input", "reviewing", "result", "confirmed"].includes(state.mode) &&
      isReviewableArtifactRuleResolution(
        canonicalizeArtifactRuleResolution(state.artifactRuleResolution),
        state.artifactRuleFingerprint,
      ) &&
      Array.isArray(state.cards) &&
      Number.isInteger(state.currentCardIndex) &&
      Number.isInteger(state.currentResultIndex)
    );
  }

  function isNormalizedObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function canonicalizeArtifactRuleResolution(value) {
    if (!isNormalizedObject(value)) return null;
    if (value.status === "resolved" && value.source === "agents") {
      return { status: "resolved", source: "agents" };
    }
    if (value.status === "unresolved-candidate" && value.source === "candidate") {
      return { status: "unresolved-candidate", source: "candidate" };
    }
    if (
      value.status === "temporarily-confirmed-candidate" &&
      value.source === "candidate" &&
      isNonEmptyString(value.confirmedRuleFingerprint)
    ) {
      return {
        status: "temporarily-confirmed-candidate",
        source: "candidate",
        confirmedRuleFingerprint: value.confirmedRuleFingerprint,
      };
    }
    return null;
  }

  function isReviewableArtifactRuleResolution(value, artifactRuleFingerprint) {
    if (!value) return false;
    if (value.status === "resolved" && value.source === "agents") return true;
    return (
      value.status === "temporarily-confirmed-candidate" &&
      value.source === "candidate" &&
      isNonEmptyString(artifactRuleFingerprint) &&
      value.confirmedRuleFingerprint === artifactRuleFingerprint
    );
  }

  function isDeliveryUnitKey(value) {
    return (
      isNonEmptyString(value) &&
      !value.startsWith("/") &&
      !value.includes("\\") &&
      value.split("/").length >= 2 &&
      value.split("/").every((part) => part !== "." && part !== ".." && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))
    );
  }

  function isFingerprint(value) {
    return isNonEmptyString(value) && /^sha256:[^\s]+$/.test(value);
  }

  function isStringArray(value) {
    return Array.isArray(value) && value.every(isNonEmptyString);
  }

  function isSourceEvidence(value) {
    return (
      isNormalizedObject(value) &&
      isNonEmptyString(value.id) &&
      isNonEmptyString(value.kind) &&
      isNonEmptyString(value.label) &&
      (value.selector === undefined || typeof value.selector === "string") &&
      (value.frameSelector === undefined || typeof value.frameSelector === "string") &&
      (value.path === undefined || typeof value.path === "string")
    );
  }

  function normalizeSourceEvidence(value) {
    return {
      id: value.id,
      kind: value.kind,
      label: value.label,
      ...(value.selector !== undefined ? { selector: value.selector } : {}),
      ...(value.frameSelector !== undefined ? { frameSelector: value.frameSelector } : {}),
      ...(value.path !== undefined ? { path: value.path } : {}),
    };
  }

  function normalizeEmbeddedReviewResult(value) {
    return {
      ...(RESULT_CONCLUSIONS.has(value.conclusion) ? { conclusion: value.conclusion } : {}),
      ...(typeof value.summary === "string" ? { summary: value.summary } : {}),
      ...(typeof value.planChangeSummary === "string" ? { planChangeSummary: value.planChangeSummary } : {}),
      ...(USER_CONCLUSIONS.has(value.previousConclusion) ? { previousConclusion: value.previousConclusion } : {}),
    };
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
    assertArtifactLocationRule,
    assertPlanFingerprint,
    clampPanelPosition,
    createCleanupRegistry,
    createPlanConfirmationGate,
    createReviewState,
    DRAFT_TTL_MS,
    highlightEvidence,
    loadDraft,
    prioritizeReviewResults,
    reduceReviewState,
    restoreDraft,
    sanitizeDraft,
    saveDraft,
    selectRoundCards,
    mountReviewPanel,
  };
});
