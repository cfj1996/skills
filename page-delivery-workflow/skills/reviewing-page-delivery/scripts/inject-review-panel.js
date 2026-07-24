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

    const cards = selectRoundCards(session.cards, session.reviewRound).map(deepClone);

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

  function mountReviewPanel() {
    throw new Error("Not implemented");
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
      results: action.results.map(deepClone).sort(compareResults),
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
