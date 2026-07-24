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

  function buildStorageKey(deliveryUnitKey) {
    return `page-delivery-review:v1:${deliveryUnitKey}`;
  }

  function clampPanelPosition(position, panelSize, viewportSize) {
    const maxX = Math.max(0, finiteNumber(viewportSize.width) - finiteNumber(panelSize.width));
    const maxY = Math.max(0, finiteNumber(viewportSize.height) - finiteNumber(panelSize.height));

    return {
      x: clamp(finiteNumber(position.x), 0, maxX),
      y: clamp(finiteNumber(position.y), 0, maxY),
    };
  }

  function createReviewState(session) {
    const cards = selectRoundCards(session.cards || [], session.reviewRound).map(cloneForPanel);

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
      mode: "reviewing",
      submissionVersion: 0,
      lastSubmission: null,
      results: [],
      lastError: null,
    };
  }

  function reduceReviewState(state, action) {
    switch (action.type) {
      case "EDIT_CARD":
        return editCurrentCard(state, action.patch || {});
      case "NEXT":
        return moveCurrentCard(state, 1);
      case "PREVIOUS":
        return moveCurrentCard(state, -1);
      case "SUBMIT":
        return submit(state);
      case "APPLY_RESULT":
        return applyResult(state, action);
      case "CONFIRM_PLAN":
        return state.mode === "result" ? { ...state, mode: "confirmed" } : state;
      default:
        return state;
    }
  }

  function selectRoundCards(cards, reviewRound) {
    if (reviewRound <= 1) return cards;
    return cards.filter(
      (card) =>
        !RESOLVED_CONCLUSIONS.has(card.conclusion) ||
        card.reopened === true ||
        card.evidenceChanged === true,
    );
  }

  function mountReviewPanel() {
    throw new Error("Not implemented");
  }

  function editCurrentCard(state, patch) {
    const currentCard = state.cards[state.currentCardIndex];
    if (!currentCard) return state;

    const cards = state.cards.slice();
    cards[state.currentCardIndex] = {
      ...currentCard,
      ...cloneForPanel(patch),
    };
    return { ...state, cards, lastError: null };
  }

  function moveCurrentCard(state, direction) {
    const lastCardIndex = Math.max(0, state.cards.length - 1);
    return {
      ...state,
      currentCardIndex: clamp(state.currentCardIndex + direction, 0, lastCardIndex),
    };
  }

  function submit(state) {
    const submissionVersion = state.submissionVersion + 1;
    const snapshot = deepFreeze({
      sessionId: state.sessionId,
      submissionVersion,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
      cards: state.cards.map(cloneForPanel),
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
      action.sessionId !== state.sessionId ||
      action.submissionVersion !== state.submissionVersion
    ) {
      return { ...state, lastError: "Stale review result ignored" };
    }

    return {
      ...state,
      mode: "result",
      results: (action.results || []).map(cloneForPanel).sort(compareResults),
      lastError: null,
    };
  }

  function compareResults(left, right) {
    return resultPriority(left) - resultPriority(right);
  }

  function resultPriority(result) {
    return RESULT_PRIORITIES.get(result.conclusion) ?? 3;
  }

  function cloneForPanel(value) {
    if (Array.isArray(value)) return value.map(cloneForPanel);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !/path$/i.test(key))
          .map(([key, nestedValue]) => [key, cloneForPanel(nestedValue)]),
      );
    }
    return value;
  }

  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }

  function finiteNumber(value) {
    return Number.isFinite(value) ? value : 0;
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
