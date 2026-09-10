(function initPageDeliveryReview(globalObject, factory) {
  // Preserve the live review until a replacement session has been validated by mountReviewPanel.
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
  const REVIEW_CONCLUSIONS = [...USER_CONCLUSIONS];
  const DOCK_SIDES = new Set(["left", "right", "floating"]);
  const SNAP_THRESHOLD = 48;
  const PANEL_WIDTH_LIMITS = Object.freeze({ default: 960, min: 720, max: 1280, viewportGap: 16 });
  const FALLBACK_PANEL_SIZE = { width: PANEL_WIDTH_LIMITS.default, height: 360 };
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

  function clampPanelWidth(width, viewportWidth) {
    const safeViewportWidth = nonNegativeFinite(viewportWidth);
    const viewportMaximum = Math.max(0, safeViewportWidth - PANEL_WIDTH_LIMITS.viewportGap);
    const maximum = Math.min(PANEL_WIDTH_LIMITS.max, viewportMaximum);
    if (maximum < PANEL_WIDTH_LIMITS.min) return maximum;
    const requested = Number.isFinite(width) ? width : PANEL_WIDTH_LIMITS.default;
    return clamp(requested, PANEL_WIDTH_LIMITS.min, maximum);
  }

  function resolveDockSide(panelX, panelWidth, viewportWidth) {
    const safeWidth = clampPanelWidth(panelWidth, viewportWidth);
    const maximumX = Math.max(0, nonNegativeFinite(viewportWidth) - safeWidth);
    const safeX = clamp(nonNegativeFinite(panelX), 0, maximumX);
    if (safeX <= SNAP_THRESHOLD) return "left";
    if (maximumX - safeX <= SNAP_THRESHOLD) return "right";
    return "floating";
  }

  function resizePanelGeometry({
    edge,
    dockSide,
    panelWidth,
    panelX,
    startPointerX,
    pointerX,
    viewportWidth,
  } = {}) {
    const safeDockSide = DOCK_SIDES.has(dockSide) ? dockSide : "floating";
    const safePanelWidth = clampPanelWidth(panelWidth, viewportWidth);
    const delta = (Number.isFinite(pointerX) ? pointerX : 0) -
      (Number.isFinite(startPointerX) ? startPointerX : 0);
    const requestedWidth = edge === "left" ? safePanelWidth - delta : safePanelWidth + delta;
    const nextWidth = clampPanelWidth(requestedWidth, viewportWidth);
    const maximumX = Math.max(0, nonNegativeFinite(viewportWidth) - nextWidth);

    if (safeDockSide === "left") {
      return { dockSide: "left", panelWidth: nextWidth, panelX: 0 };
    }
    if (safeDockSide === "right") {
      return { dockSide: "right", panelWidth: nextWidth, panelX: maximumX };
    }

    const startX = nonNegativeFinite(panelX);
    const preservedRight = startX + safePanelWidth;
    const nextX = edge === "left" ? preservedRight - nextWidth : startX;
    return {
      dockSide: "floating",
      panelWidth: nextWidth,
      panelX: clamp(nextX, 0, maximumX),
    };
  }

  function countReviewConclusions(items) {
    const counts = Object.fromEntries(REVIEW_CONCLUSIONS.map((conclusion) => [conclusion, 0]));
    for (const item of Array.isArray(items) ? items : []) {
      if (Object.hasOwn(counts, item?.conclusion)) counts[item.conclusion] += 1;
    }
    return counts;
  }

  function createReviewState(session) {
    const normalized = normalizeReviewSession(session);
    const cards = selectReviewCards(normalized.cards, normalized.reviewRound, normalized.viewScope);

    return {
      ...normalized,
      cards,
      allCards: normalized.cards,
      previousSubmissions: [],
      currentCardIndex: 0,
      currentResultIndex: 0,
      mode: "input",
      submissionVersion: 0,
      lastSubmission: null,
      saveState: "unsaved",
      savedPlanFingerprint: null,
      results: [],
      lastError: null,
    };
  }

  function normalizeReviewSession(session) {
    if (!isNormalizedObject(session) || !Array.isArray(session.cards) || !isNonEmptyString(session.sessionId)) {
      throw createCodedError(TypeError, "invalid-review-session", "ReviewSession must include a sessionId and cards array");
    }
    if (![1, 2].includes(session.schemaVersion)) {
      throw createCodedError(TypeError, "invalid-review-schema-version", "ReviewSession schemaVersion must be 1 or 2");
    }
    if (!isDeliveryUnitKey(session.deliveryUnitKey)) {
      throw createCodedError(TypeError, "invalid-delivery-unit-key", "ReviewSession deliveryUnitKey must be a safe relative key");
    }
    if (!["page", "module"].includes(session.deliveryUnitKind)) {
      throw createCodedError(TypeError, "invalid-delivery-unit-kind", "ReviewSession deliveryUnitKind must be page or module");
    }
    if (!isNonEmptyString(session.deliveryUnitName)) {
      throw createCodedError(TypeError, "invalid-delivery-unit-name", "ReviewSession deliveryUnitName must be a non-empty string");
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
    let cards = session.cards.map(card => normalizeReviewCard(card, session.schemaVersion));
    const ids = new Set();
    for (const card of cards) {
      if (ids.has(card.id)) {
        throw createCodedError(TypeError, "duplicate-review-card-id", `Duplicate review card id: ${card.id}`);
      }
      ids.add(card.id);
    }
    if (session.schemaVersion === 2) {
      validateModuleTree(cards);
      const ordered = [];
      const visit = parentId => cards.filter(card => card.module.parentId === parentId).forEach(card => {
        ordered.push(card); visit(card.id);
      });
      visit(null);
      cards = ordered;
    }
    return {
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      deliveryUnitKey: session.deliveryUnitKey,
      deliveryUnitKind: session.deliveryUnitKind,
      deliveryUnitName: session.deliveryUnitName.trim(),
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

  function normalizeReviewCard(card, schemaVersion = 1) {
    let module;
    if (schemaVersion === 2) {
      module = normalizeModule(card?.module);
      card = {
        ...card,
        dimension: "功能模块",
        reviewGoal: module.name,
        design: module.purpose,
        regionAndComponents: module.name,
        interactionStates: card.interactionStates ?? [],
        relatedApis: card.relatedApis ?? [],
        mockScenarios: card.mockScenarios ?? [],
        acceptanceCriteria: module.scenarios.map(item => `${item.given}；${item.when}；${item.then}`),
        reopened: card.reopened ?? false,
        evidenceChanged: card.evidenceChanged ?? false,
        reviewResult: card.reviewResult ?? null,
        userNote: card.userNote ?? "",
        conclusion: card.conclusion ?? "未评审",
        links: card.links ?? Object.fromEntries(LINK_FIELDS.map(field => [field, []])),
      };
    }
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
    const implementationPlan = normalizeImplementationPlan(
      card.implementationPlan,
      card.sourceEvidence,
      card.conclusion,
    );
    return {
      id: card.id,
      ...(module ? { module } : {}),
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
      implementationPlan,
      conclusion: card.conclusion,
      userNote: card.userNote,
      reviewResult: card.reviewResult === null ? null : normalizeEmbeddedReviewResult(card.reviewResult),
      reopened: card.reopened,
      evidenceChanged: card.evidenceChanged,
      ...(card.telepath !== undefined ? { telepath: card.telepath } : {}),
    };
  }

  function normalizeImplementationPlan(value, sourceEvidence, conclusion) {
    if (
      !isNormalizedObject(value) ||
      !["ready", "blocked"].includes(value.status) ||
      !isNonEmptyString(value.summary) ||
      !isStringArray(value.structure) ||
      !isStringArray(value.linkage) ||
      !isStringArray(value.dataFlow) ||
      !isStringArray(value.acceptanceFocus) ||
      !isStringArray(value.evidenceIds) ||
      !isStringArray(value.blockers)
    ) {
      throw createCodedError(
        TypeError,
        "invalid-implementation-plan",
        "Review card implementationPlan must follow the approved canonical schema",
      );
    }
    if (
      value.status === "ready" &&
      (
        value.structure.length === 0 ||
        value.linkage.length === 0 ||
        value.dataFlow.length === 0 ||
        value.acceptanceFocus.length === 0 ||
        value.evidenceIds.length === 0 ||
        value.blockers.length > 0
      )
    ) {
      throw createCodedError(
        TypeError,
        "incomplete-implementation-plan",
        "Ready implementation plans require all four summaries and supporting evidence",
      );
    }
    if (value.status === "blocked" && value.blockers.length === 0) {
      throw createCodedError(
        TypeError,
        "incomplete-implementation-plan",
        "Blocked implementation plans require explicit blockers",
      );
    }
    const availableEvidenceIds = new Set(sourceEvidence.map((evidence) => evidence.id));
    if (value.evidenceIds.some((evidenceId) => !availableEvidenceIds.has(evidenceId))) {
      throw createCodedError(
        TypeError,
        "invalid-implementation-evidence",
        "Implementation plan evidenceIds must reference card sourceEvidence",
      );
    }
    return {
      status: value.status,
      summary: value.summary,
      structure: [...value.structure],
      linkage: [...value.linkage],
      dataFlow: [...value.dataFlow],
      acceptanceFocus: [...value.acceptanceFocus],
      evidenceIds: [...value.evidenceIds],
      blockers: [...value.blockers],
    };
  }

  function normalizeModule(value) {
    const fail = () => { throw createCodedError(TypeError, "invalid-module", "Module requires a name, purpose, inputs, outputs, rules, examples, questions, change and revision"); };
    if (!isNormalizedObject(value) || !isNonEmptyString(value.name) || !isNonEmptyString(value.purpose) ||
      !(value.parentId === null || isNonEmptyString(value.parentId)) ||
      !Number.isSafeInteger(value.revision) || value.revision < 1) fail();
    for (const field of ["inputs", "outputs", "rules"]) {
      if (!isStringArray(value[field]) || !value[field].length) fail();
    }
    if (!Array.isArray(value.scenarios) || !value.scenarios.length ||
      !value.scenarios.every(item => isNormalizedObject(item) && ["id", "given", "when", "then"].every(key => isNonEmptyString(item[key])))) fail();
    if (!Array.isArray(value.questions) || !value.questions.every(item =>
      isNormalizedObject(item) && ["id", "question", "impact", "recommendation"].every(key => isNonEmptyString(item[key])) && ["user", "agent"].includes(item.owner))) fail();
    for (const items of [value.scenarios, value.questions]) {
      if (new Set(items.map(item => item.id)).size !== items.length) fail();
    }
    if (!isNormalizedObject(value.change) || !["added", "modified", "removed", "unchanged"].includes(value.change.kind) || !isNonEmptyString(value.change.summary)) fail();
    return {
      name: value.name, parentId: value.parentId, purpose: value.purpose, revision: value.revision,
      inputs: [...value.inputs], outputs: [...value.outputs], rules: [...value.rules],
      scenarios: value.scenarios.map(({ id, given, when, then }) => ({ id, given, when, then })),
      questions: value.questions.map(({ id, question, impact, owner, recommendation }) => ({ id, question, impact, owner, recommendation })),
      change: { kind: value.change.kind, summary: value.change.summary },
    };
  }

  function validateModuleTree(cards) {
    const byId = new Map(cards.map(card => [card.id, card]));
    for (const collection of ["scenarios", "questions"]) {
      const ids = cards.flatMap(card => card.module[collection].map(item => item.id));
      if (new Set(ids).size !== ids.length) throw createCodedError(TypeError, "duplicate-module-item-id", "Scenario and question ids must be unique within the module tree");
    }
    for (const card of cards) {
      const seen = new Set([card.id]);
      let parent = card.module.parentId;
      while (parent !== null) {
        if (!byId.has(parent) || seen.has(parent)) {
          throw createCodedError(TypeError, "invalid-module-tree", "Module parent must exist and hierarchy must be acyclic");
        }
        seen.add(parent);
        parent = byId.get(parent).module.parentId;
      }
    }
  }

  function moduleContent(card) {
    const { conclusion, userNote, reviewResult, reopened, evidenceChanged, ...content } = card;
    const { revision, change, ...module } = content.module;
    return JSON.stringify({ ...content, module: { ...module, removed: change.kind === "removed" } });
  }

  function requirementContent(card) {
    const { revision, questions, change, ...module } = card.module;
    return JSON.stringify({ ...module, removed: change.kind === "removed", questions: questions.filter(question => question.owner === "user") });
  }

  function mergeReviewSession(state, nextSession) {
    const next = normalizeReviewSession(nextSession);
    if (next.schemaVersion !== 2 || state.schemaVersion !== 2 || next.sessionId === state.sessionId ||
      next.deliveryUnitKey !== state.deliveryUnitKey || next.planFingerprint !== (state.savedPlanFingerprint || state.planFingerprint) ||
      next.artifactRuleFingerprint !== state.artifactRuleFingerprint ||
      next.reviewRound !== state.reviewRound + (state.mode === "input" ? 0 : 1)) {
      throw createCodedError(TypeError, "invalid-session-update", "Update requires a new session for this module, current fingerprints and the correct round");
    }
    const oldById = new Map((state.allCards || state.cards).map(card => [card.id, card]));
    state.cards.forEach(card => oldById.set(card.id, card));
    const nextIds = new Set(next.cards.map(card => card.id));
    if ([...oldById.keys()].some(id => !nextIds.has(id))) {
      throw createCodedError(TypeError, "missing-module-update", "Keep existing modules; represent removals explicitly in change.kind");
    }
    next.cards = next.cards.map(card => {
      const old = oldById.get(card.id);
      if (!old) return { ...card, conclusion: "未评审", userNote: "", reopened: false };
      const changed = moduleContent(old) !== moduleContent(card);
      if (card.module.revision < old.module.revision) {
        throw createCodedError(TypeError, "module-revision-required", "Module revisions cannot move backwards");
      }
      if (!changed) return { ...card, conclusion: old.conclusion, userNote: old.userNote, reviewResult: old.reviewResult, reopened: old.reopened, evidenceChanged: old.evidenceChanged };
      if (card.module.revision <= old.module.revision) {
        throw createCodedError(TypeError, "module-revision-required", "Changed modules must increment their revision");
      }
      const requirementChanged = requirementContent(old) !== requirementContent(card);
      return { ...card, conclusion: requirementChanged ? "未评审" : old.conclusion, userNote: old.userNote,
        reopened: true, evidenceChanged: true,
        reviewResult: { ...(old.reviewResult || {}), previousConclusion: old.conclusion } };
    });
    const created = createReviewState(next);
    const currentId = state.cards[state.currentCardIndex]?.id;
    const selectedIndex = created.cards.findIndex(card => card.id === currentId);
    return { ...created, currentCardIndex: Math.max(0, selectedIndex),
      previousSubmissions: [...(state.previousSubmissions || []), ...(state.lastSubmission ? [state.lastSubmission] : [])] };
  }

  function reduceReviewState(state, action) {
    if (!isReviewState(state) || !action || typeof action !== "object") {
      return state;
    }

    if (state.mode === "confirmed" && action.type === "MARK_PLAN_SAVED") {
      if (
        action.sessionId !== state.sessionId ||
        action.submissionId !== state.lastSubmission?.submissionId ||
        assertCurrentFingerprints(state, action) ||
        !isFingerprint(action.savedPlanFingerprint)
      ) return { ...state, lastError: reviewError("invalid-save-receipt", "保存回执与当前评审不匹配，请核对实际文件。") };
      return { ...state, saveState: "saved", savedPlanFingerprint: action.savedPlanFingerprint, lastError: null };
    }

    if (state.mode === "input") {
      switch (action.type) {
        case "EDIT_CARD":
          return editCurrentCard(state, action.patch);
        case "NEXT":
          return moveCurrentCard(state, 1);
        case "PREVIOUS":
          return moveCurrentCard(state, -1);
        case "SELECT_CARD":
          return selectCurrentCard(state, action.index);
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
      if (action.type === "SELECT_RESULT") return selectCurrentResult(state, action.index);
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
        return { ...state, mode: "confirmed", saveState: "pending", lastError: null };
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
        (card.reviewResult?.conclusion && !RESOLVED_CONCLUSIONS.has(card.reviewResult.conclusion)) ||
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

  function createWakeNotifier(config, fetchImpl = globalThis.fetch) {
    let endpoint;
    try { endpoint = new URL(config?.endpoint); } catch { throw new Error("Invalid wake bridge endpoint"); }
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" ||
      !endpoint.port || endpoint.pathname !== "/notify" || endpoint.search || endpoint.hash ||
      endpoint.username || endpoint.password || !isNonEmptyString(config.token) ||
      !Number.isFinite(Date.parse(config.expiresAt)) || Date.parse(config.expiresAt) <= Date.now() ||
      typeof fetchImpl !== "function") throw new Error("Invalid or expired wake bridge configuration");
    const token = config.token;
    const expiresAt = Date.parse(config.expiresAt);
    async function request(path, payload) {
      if (Date.now() >= expiresAt) throw new Error("Wake bridge expired");
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 12000);
      try {
        const response = await fetchImpl(new URL(path, endpoint).href, {
          method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ token, ...payload }), signal: abort.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Wake bridge request failed");
        return body;
      } finally { clearTimeout(timer); }
    }
    return {
      async check() {
        const response = await request("/health", {});
        if (response.ready !== true) throw new Error("Wake bridge unavailable");
      },
      async notify(event, submission) {
        const payload = Object.fromEntries(["sessionId", "submissionId", "submissionVersion", "planFingerprint", "artifactRuleFingerprint"].map(key => [key, submission[key]]));
        const response = await request("/notify", { event, ...payload });
        if (response.queued !== true) throw new Error("Notification was not queued");
        return response;
      },
    };
  }

  function restoreSubmittedReview(state, snapshot) {
    if (!isNormalizedObject(snapshot) || snapshot.sessionId !== state.sessionId ||
      snapshot.planFingerprint !== state.planFingerprint || snapshot.artifactRuleFingerprint !== state.artifactRuleFingerprint ||
      !isNonEmptyString(snapshot.submissionId) || !Number.isSafeInteger(snapshot.submissionVersion) || snapshot.submissionVersion < 1 ||
      !Array.isArray(snapshot.cards)) throw createCodedError(TypeError, "invalid-submission-restore", "Only the matching exported submission can be restored");
    const cards = snapshot.cards.map(card => normalizeReviewCard(card, state.schemaVersion));
    if (JSON.stringify(cards) !== JSON.stringify(state.cards)) {
      throw createCodedError(TypeError, "invalid-submission-restore", "Restored submission must match the current review content and opinions");
    }
    const lastSubmission = deepFreeze({ sessionId: state.sessionId, submissionId: snapshot.submissionId,
      submissionVersion: snapshot.submissionVersion, planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint, artifactRuleResolution: deepClone(state.artifactRuleResolution), cards });
    return { ...state, mode: "reviewing", submissionVersion: snapshot.submissionVersion, lastSubmission, lastError: null };
  }

  function mountReviewPanel(session, options = {}) {
    let state = createReviewState(session);
    if (options.resumeSubmission) state = restoreSubmittedReview(state, options.resumeSubmission);
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
    if (!options.resumeSubmission) state = restoreDraft(state, validatedDraft, now);

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
    const initialViewport = {
      width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
    };
    let panelWidth = clampPanelWidth(safeUiDraft?.panelWidth, initialViewport.width);
    let dockSide = DOCK_SIDES.has(safeUiDraft?.dockSide) ? safeUiDraft.dockSide : "right";
    let panelPosition = initialPanelPosition(
      host,
      safeUiDraft?.panelPosition,
      panelWidth,
      dockSide,
    );
    let drag = null;
    let evidenceStatus = null;
    const confirmationGate = createPlanConfirmationGate();
    let wakeNotifier = null;
    let notification = { status: "manual", event: null };
    let wakeGeneration = 0;
    let pendingWake = null;

    setHostPosition(host, panelPosition, panelWidth);

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
      submissionVersion: state.submissionVersion,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
      artifactRuleResolution: state.artifactRuleResolution,
      savedAt: Date.now(),
      cards: state.cards.map(({ id, conclusion, userNote }) => ({ id, conclusion, userNote })),
      currentCardIndex: state.currentCardIndex,
      collapsed,
      panelPosition,
      panelWidth,
      dockSide,
    });
    const updatePanelPosition = (position, snap = false) => {
      const viewport = currentViewport();
      const size = { ...panelSize(), width: panelWidth };
      panelPosition = clampPanelPosition(position, size, viewport);
      if (snap) {
        dockSide = resolveDockSide(panelPosition.x, panelWidth, viewport.width);
        if (dockSide === "left") panelPosition.x = 0;
        if (dockSide === "right") panelPosition.x = Math.max(0, viewport.width - panelWidth);
      }
      setHostPosition(host, panelPosition, panelWidth);
      persistDraft();
      if (snap) render();
    };
    const updatePanelGeometry = (geometry) => {
      panelWidth = geometry.panelWidth;
      dockSide = geometry.dockSide;
      panelPosition = clampPanelPosition(
        { ...panelPosition, x: geometry.panelX },
        { ...panelSize(), width: panelWidth },
        currentViewport(),
      );
      setHostPosition(host, panelPosition, panelWidth);
      persistDraft();
    };
    const runtimeState = () => ({
      ...deepClone(state),
      collapsed,
      panelPosition: { ...panelPosition },
      panelWidth,
      dockSide,
      notification: { ...notification },
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
      // Keep the live textarea (and its IME composition/selection) intact while typing.
      const noteOnly = action.type === "EDIT_CARD" &&
        Object.keys(action.patch || {}).every((key) => key === "userNote");
      if (!noteOnly) render();
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
    const notifyAgent = async (event) => {
      if (!state.lastSubmission) return;
      if (!wakeNotifier) {
        if (notification.status === "connecting") pendingWake = { event, sessionId: state.sessionId, submissionId: state.lastSubmission.submissionId };
        return;
      }
      const notifier = wakeNotifier;
      const sessionId = state.sessionId;
      const generation = ++wakeGeneration;
      notification = { status: "sending", event };
      render();
      try {
        await notifier.notify(event, state.lastSubmission);
        if (!destroyed && state.sessionId === sessionId && generation === wakeGeneration) {
          notification = { status: "queued", event };
          render();
        }
      } catch {
        if (!destroyed && state.sessionId === sessionId && generation === wakeGeneration) {
          notification = { status: "failed", event };
          render();
        }
      }
    };
    const connectWakeBridge = async (config, { notifyExistingSubmission = false } = {}) => {
      const generation = ++wakeGeneration;
      wakeNotifier = null;
      pendingWake = null;
      notification = { status: "connecting", event: null };
      if (notifyExistingSubmission && state.mode === "reviewing" && state.lastSubmission) {
        pendingWake = { event: "review-submitted", sessionId: state.sessionId, submissionId: state.lastSubmission.submissionId };
      }
      render();
      try {
        const notifier = createWakeNotifier(config);
        await notifier.check();
        if (destroyed || generation !== wakeGeneration) return { connected: false };
        wakeNotifier = notifier;
        notification = { status: "ready", event: null };
        render();
        const waiting = pendingWake;
        pendingWake = null;
        if (waiting?.sessionId === state.sessionId && waiting.submissionId === state.lastSubmission?.submissionId) {
          void notifyAgent(waiting.event);
        }
        return { connected: true };
      } catch {
        if (!destroyed && generation === wakeGeneration) {
          wakeNotifier = null;
          pendingWake = null;
          notification = { status: "failed", event: null };
          render();
        }
        return { connected: false };
      }
    };
    const requestPlanConfirmation = (event) => {
      const requestError = confirmationGate.request(state, event);
      if (requestError) {
        if (requestError.code !== "untrusted-confirmation-request") setRuntimeError(requestError);
        return;
      }
      void notifyAgent("plan-confirm-requested");
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
      wakeGeneration += 1;
      wakeNotifier = null;
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
      connectWakeBridge,
      markPlanSaved: (receipt) => dispatch({ ...receipt, type: "MARK_PLAN_SAVED" }),
      updateReviewSession: (nextSession) => {
        const merged = mergeReviewSession(state, nextSession);
        confirmationGate.invalidate();
        state = merged;
        wakeGeneration += 1;
        pendingWake = null;
        notification = { status: wakeNotifier ? "ready" : "manual", event: null };
        persistDraft();
        render();
        return runtimeState();
      },
      exportSubmission: () => state.lastSubmission,
      applyResult: applyResultFromPage,
      confirmPlan,
      getPlanConfirmationRequest: () => confirmationGate.peek(),
      destroy,
    };
    const render = () => {
      removeRenderListeners();
      shadowRoot.replaceChildren();
      const style = document.createElement("style");
      style.textContent = panelCss();
      const shell = document.createElement("section");
      shell.setAttribute("data-review-panel", "");
      shell.toggleAttribute("data-collapsed", collapsed);
      shell.innerHTML = panelMarkup({ ...state, notification }, collapsed, evidenceStatus, { dockSide });
      shadowRoot.append(style, shell);

      const listen = (selector, type, listener) => {
        const target = shadowRoot.querySelector(selector);
        if (target) addListener(target, type, listener, renderCleanups);
      };
      const listenAll = (selector, type, listener) => {
        shadowRoot.querySelectorAll(selector).forEach((target) =>
          addListener(target, type, listener, renderCleanups));
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
          void notifyAgent("review-submitted");
          console.debug("PAGE_DELIVERY_REVIEW_SUBMITTED", {
            sessionId: state.sessionId,
            submissionVersion: state.submissionVersion,
          });
        }
      });
      listen('[data-action="confirm-plan"]', "click", requestPlanConfirmation);
      listenAll('[data-action="select-card"]', "click", (event) =>
        dispatch({ type: "SELECT_CARD", index: Number(event.currentTarget.dataset.cardIndex) }),
      );
      listenAll('[data-action="select-result"]', "click", (event) =>
        dispatch({ type: "SELECT_RESULT", index: Number(event.currentTarget.dataset.resultIndex) }),
      );
      listenAll('[data-action="select-conclusion"]', "click", (event) =>
        dispatch({ type: "EDIT_CARD", patch: { conclusion: event.currentTarget.dataset.value } }),
      );
      listen('[data-field="userNote"]', "input", (event) =>
        dispatch({ type: "EDIT_CARD", patch: { userNote: event.target.value } }),
      );
      listen("[data-review-panel-titlebar]", "pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest?.("button")) return;
        drag = {
          kind: "move",
          pointerId: event.pointerId,
          offsetX: event.clientX - panelPosition.x,
          offsetY: event.clientY - panelPosition.y,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      });
      listenAll("[data-review-resize-edge]", "pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.stopPropagation();
        drag = {
          kind: "resize",
          pointerId: event.pointerId,
          edge: event.currentTarget.dataset.reviewResizeEdge,
          dockSide,
          panelWidth,
          panelX: panelPosition.x,
          startPointerX: event.clientX,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      });
    };

    addListener(document, "pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.kind === "resize") {
        updatePanelGeometry(resizePanelGeometry({
          ...drag,
          pointerX: event.clientX,
          viewportWidth: currentViewport().width,
        }));
        return;
      }
      updatePanelPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY });
    });
    addListener(document, "pointerup", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.kind === "resize") {
        updatePanelGeometry(resizePanelGeometry({
          ...drag,
          pointerX: event.clientX,
          viewportWidth: currentViewport().width,
        }));
      } else {
        updatePanelPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, true);
      }
      drag = null;
    });
    addListener(window, "resize", () => {
      const viewport = currentViewport();
      panelWidth = clampPanelWidth(panelWidth, viewport.width);
      if (dockSide === "left") panelPosition.x = 0;
      if (dockSide === "right") panelPosition.x = Math.max(0, viewport.width - panelWidth);
      updatePanelPosition(panelPosition);
      render();
    });

    activeRuntime = { destroy };
    globalThis.__PAGE_DELIVERY_REVIEW__ = pageApi;
    render();
    if (options.wakeBridge) void connectWakeBridge(options.wakeBridge);
    return pageApi;
  }

  function initialPanelPosition(host, savedPosition, panelWidth, dockSide) {
    const viewport = {
      width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
    };
    const rect = host.getBoundingClientRect();
    const panelSize = {
      width: panelWidth || rect.width || FALLBACK_PANEL_SIZE.width,
      height: rect.height || FALLBACK_PANEL_SIZE.height,
    };
    const defaultX = dockSide === "left" ? 0 : Math.max(0, viewport.width - panelSize.width);
    const requestedPosition = { ...(savedPosition || { x: defaultX, y: 16 }) };
    if (dockSide === "left") requestedPosition.x = 0;
    if (dockSide === "right") requestedPosition.x = Math.max(0, viewport.width - panelSize.width);
    return clampPanelPosition(
      requestedPosition,
      panelSize,
      viewport,
    );
  }

  function setHostPosition(host, position, panelWidth = PANEL_WIDTH_LIMITS.default) {
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("left", `${position.x}px`, "important");
    host.style.setProperty("top", `${position.y}px`, "important");
    host.style.setProperty("z-index", "2147483645", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("width", `${panelWidth}px`, "important");
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
      ...(Number.isSafeInteger(draft.submissionVersion) && draft.submissionVersion >= 0
        ? { submissionVersion: draft.submissionVersion } : {}),
      ...(isNonEmptyString(draft.planFingerprint) ? { planFingerprint: draft.planFingerprint } : {}),
      ...(isNonEmptyString(draft.artifactRuleFingerprint) ? { artifactRuleFingerprint: draft.artifactRuleFingerprint } : {}),
      ...(artifactRuleResolution ? { artifactRuleResolution } : {}),
      ...(Number.isFinite(draft.savedAt) ? { savedAt: draft.savedAt } : {}),
      cards,
      ...(Number.isInteger(draft.currentCardIndex) ? { currentCardIndex: draft.currentCardIndex } : {}),
      ...(draft.collapsed === true ? { collapsed: true } : {}),
      ...(Number.isFinite(draft.panelWidth) ? { panelWidth: draft.panelWidth } : {}),
      ...(DOCK_SIDES.has(draft.dockSide) ? { dockSide: draft.dockSide } : {}),
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
      submissionVersion: Number.isSafeInteger(draft.submissionVersion) && draft.submissionVersion >= 0
        ? draft.submissionVersion : state.submissionVersion,
      lastError: draft.submissionVersion > 0
        ? reviewError("resubmission-required", "页面已重新挂载，已恢复评审输入；请重新提交，旧结果与确认请求已失效。")
        : state.lastError,
      cards: state.cards.map((card) => {
        const saved = edits.get(card.id);
        if (!saved) return card;
        const patch = {};
        if (
          USER_CONCLUSIONS.has(saved.conclusion)
        ) patch.conclusion = saved.conclusion;
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
      :host {
        --review-primary: #1976d2;
        --review-primary-dark: #1565c0;
        --review-text: rgba(0, 0, 0, .87);
        --review-text-secondary: rgba(0, 0, 0, .6);
        --review-divider: rgba(0, 0, 0, .12);
        --review-surface: #fff;
        --review-surface-muted: #f5f5f5;
        all: initial;
        color: var(--review-text);
        font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      button, textarea { font: inherit; }
      button:focus-visible, textarea:focus-visible {
        outline: 3px solid rgba(25, 118, 210, .28);
        outline-offset: 2px;
      }
      [data-review-panel] {
        background: var(--review-surface) !important;
        border: 1px solid var(--review-divider);
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .18), 0 2px 8px rgba(0, 0, 0, .12);
        color: var(--review-text) !important;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 16px);
        min-height: 320px;
        overflow: hidden;
        position: relative;
      }
      [data-review-panel][data-collapsed] { min-height: 0; }
      [data-review-panel-titlebar] {
        align-items: center;
        background: var(--review-surface);
        border-bottom: 1px solid var(--review-divider);
        cursor: grab;
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(200px, 1fr) auto auto;
        min-height: 72px;
        padding: 8px 16px;
        touch-action: none;
      }
      [data-review-heading] { display: grid; gap: 2px; min-width: 0; }
      [data-review-title] { font-size: 18px; font-weight: 500; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      [data-review-context] { color: var(--review-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      [data-review-status-summary] { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
      [data-review-status] {
        align-items: center;
        background: #eeeeee;
        border-radius: 10px;
        color: #616161;
        display: inline-flex;
        font-size: 11px;
        font-weight: 500;
        gap: 4px;
        line-height: 20px;
        min-height: 20px;
        padding: 0 8px;
        white-space: nowrap;
      }
      [data-review-status][data-status="已确认"] { background: #e8f5e9; color: #2e7d32; }
      [data-review-status][data-status="待修改"] { background: #fff3e0; color: #ed6c02; }
      [data-review-status][data-status="阻塞"] { background: #ffebee; color: #d32f2f; }
      [data-review-status][data-status="不适用"] { background: #eceff1; color: #546e7a; }
      [data-review-status][data-status="冲突"] { background: #fce4ec; color: #c2185b; }
      [data-review-body] {
        display: grid;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }
      [data-review-alerts] { display: grid; gap: 8px; padding: 8px 16px 0; }
      [data-review-error], [data-review-evidence-status], [data-review-confirm-blocked] {
        border-radius: 4px;
        font-size: 13px;
        margin: 0;
        padding: 8px 12px;
      }
      [data-review-error], [data-review-confirm-blocked] { background: #ffebee; color: #c62828; }
      [data-review-evidence-status] { background: #e3f2fd; color: #1565c0; }
      [data-review-layout] {
        display: grid;
        grid-template-columns: minmax(216px, 30%) minmax(0, 1fr);
        min-height: 0;
      }
      [data-review-list] {
        background: #fafafa;
        border-right: 1px solid var(--review-divider);
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
        padding: 8px;
      }
      [data-review-list-label] {
        color: var(--review-text-secondary);
        font-size: 12px;
        font-weight: 500;
        letter-spacing: .04em;
        padding: 8px 12px;
      }
      [data-review-list-item] {
        align-items: flex-start;
        background: transparent;
        border: 0;
        border-radius: 8px;
        color: var(--review-text);
        cursor: pointer;
        display: grid;
        gap: 4px;
        margin: 2px 0;
        min-height: 56px;
        padding: 8px 12px;
        text-align: left;
        width: 100%;
      }
      [data-review-list-item]:hover { background: rgba(0, 0, 0, .04); }
      [data-review-list-item][aria-current="true"] { background: rgba(25, 118, 210, .12); color: #0d47a1; }
      [data-review-item-title] { font-size: 14px; font-weight: 500; line-height: 20px; }
      [data-review-item-meta] { align-items: center; color: var(--review-text-secondary); display: flex; font-size: 12px; gap: 8px; justify-content: space-between; min-width: 0; }
      [data-review-item-meta] > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      [data-review-detail] {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
      }
      [data-review-detail-scroll] { display: grid; gap: 16px; padding: 16px 24px 24px; }
      [data-review-card], [data-review-result] {
        background: var(--review-surface);
        display: grid;
        gap: 16px;
        min-width: 0;
      }
      [data-review-card-header] { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
      [data-review-card-title] { font-size: 20px; font-weight: 500; line-height: 1.4; margin: 0; }
      [data-module-content] { display: grid; gap: 20px; }
      [data-module-section] { display: grid; gap: 8px; }
      [data-module-section] h3 { font-size: 14px; margin: 0; color: #26364b; }
      [data-module-section] p { margin: 0; line-height: 1.65; font-size: 14px; }
      [data-module-section] ul { margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; }
      [data-module-io] { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      [data-module-io] > section { background: #f6f8fb; border: 1px solid #e5eaf1; border-radius: 8px; padding: 14px; }
      [data-module-change] { background: #eef5ff; border-left: 3px solid #1976d2; padding: 12px 14px; border-radius: 4px; }
      [data-module-scenario] { padding: 12px 14px; border: 1px solid #e5eaf1; border-radius: 8px; }
      [data-module-scenario] p + p { margin-top: 6px; }
      [data-module-scenario] b { display: inline-block; width: 44px; color: #62718a; font-weight: 500; }
      [data-module-question] { background: #fff8e8; border-radius: 8px; padding: 12px 14px; }
      [data-module-question] p + p { margin-top: 6px; }
      [data-review-readiness] { border-radius: 12px; padding: 4px 8px; font-size: 11px; white-space: nowrap; background: #eef1f6; color: #586579; }
      [data-review-readiness="ready"] { background: #e8f5e9; color: #2e7d32; }
      [data-review-readiness="blocked"] { background: #fff3e0; color: #ae6500; }
      [data-review-list-item][data-child-module] { margin-left: calc(14px * var(--review-depth, 1)); width: calc(100% - 14px * var(--review-depth, 1)); border-left: 2px solid #d8e2ef; border-radius: 0 6px 6px 0; }
      [data-review-list-item] [data-review-readiness] { margin-top: 2px; width: fit-content; }
      [data-review-save-status] { color: #62718a; font-size: 12px; }
      [data-review-workflow-status] { background: #eef5ff; padding: 12px 16px; font-size: 13px; line-height: 1.5; border-radius: 6px; }
      [data-module-technical] { border-top: 1px solid #e5eaf1; padding-top: 12px; }
      [data-module-technical] > summary { color: #1976d2; cursor: pointer; font-size: 14px; padding: 8px 0; }
      [data-module-technical] > div { display: grid; gap: 12px; padding-top: 12px; }
      [data-review-implementation-blocked] {
        background: #ffebee;
        border-radius: 4px;
        color: #c62828;
        display: grid;
        font-size: 13px;
        gap: 4px;
        padding: 10px 12px;
      }
      [data-review-implementation-summary] {
        background: #f3f8fe;
        border-left: 4px solid var(--review-primary);
        border-radius: 4px;
        display: grid;
        gap: 4px;
        padding: 12px 16px;
      }
      [data-review-implementation-summary] strong { color: var(--review-primary-dark); font-size: 12px; font-weight: 500; }
      [data-review-implementation-summary] span { font-size: 15px; font-weight: 500; line-height: 1.6; }
      [data-review-implementation-grid] {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      [data-review-implementation-section] {
        border: 1px solid var(--review-divider);
        border-radius: 8px;
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 12px 16px;
      }
      [data-review-implementation-section] h3 {
        font-size: 14px;
        font-weight: 500;
        margin: 0;
      }
      [data-review-implementation-section] ul {
        display: grid;
        gap: 6px;
        margin: 0;
        padding-left: 18px;
      }
      [data-review-implementation-section] li {
        font-size: 13px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      [data-review-implementation-evidence] {
        border-top: 1px solid var(--review-divider);
        padding-top: 8px;
      }
      [data-review-implementation-evidence] > summary {
        color: var(--review-primary);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        list-style-position: inside;
        min-height: 40px;
        padding: 10px 0;
      }
      [data-card-fields] { display: grid; gap: 8px; }
      [data-card-field] { border-bottom: 1px solid var(--review-divider); display: grid; gap: 4px; margin: 0; padding: 0 0 8px; }
      [data-card-field] strong { color: var(--review-text-secondary); font-size: 12px; font-weight: 500; }
      [data-card-field] span { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
      [data-review-conclusion-label], label { color: var(--review-text-secondary); display: grid; font-size: 12px; font-weight: 500; gap: 8px; }
      [data-review-conclusion-group] { display: flex; flex-wrap: wrap; gap: 0; }
      [data-review-conclusion-group] button {
        background: var(--review-surface);
        border: 1px solid var(--review-divider);
        color: var(--review-text-secondary);
        cursor: pointer;
        min-height: 40px;
        padding: 8px 14px;
      }
      [data-review-conclusion-group] button + button { margin-left: -1px; }
      [data-review-conclusion-group] button:first-child { border-radius: 4px 0 0 4px; }
      [data-review-conclusion-group] button:last-child { border-radius: 0 4px 4px 0; }
      [data-review-conclusion-group] button[aria-pressed="true"] {
        background: rgba(25, 118, 210, .12);
        border-color: var(--review-primary);
        color: var(--review-primary-dark);
        position: relative;
        z-index: 1;
      }
      textarea {
        background: var(--review-surface);
        border: 1px solid rgba(0, 0, 0, .23);
        border-radius: 4px;
        color: var(--review-text);
        min-height: 88px;
        padding: 12px;
        resize: vertical;
        width: 100%;
      }
      textarea:hover { border-color: var(--review-text); }
      [data-review-footer] {
        align-items: center;
        background: rgba(255, 255, 255, .96);
        border-top: 1px solid var(--review-divider);
        bottom: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: space-between;
        margin-top: auto;
        padding: 12px 24px;
        position: sticky;
      }
      [data-review-actions], [data-review-navigation] { display: flex; flex-wrap: wrap; gap: 8px; }
      button[data-action]:not([data-review-list-item]):not([data-action="select-conclusion"]) {
        background: var(--review-surface);
        border: 1px solid rgba(0, 0, 0, .23);
        border-radius: 4px;
        color: var(--review-primary);
        cursor: pointer;
        min-height: 40px;
        padding: 8px 16px;
      }
      button[data-action="toggle-collapse"] { min-width: 64px; }
      button[data-action="submit"], button[data-action="confirm-plan"] {
        background: var(--review-primary);
        border-color: var(--review-primary);
        color: #fff;
      }
      button[data-action="submit"]:hover, button[data-action="confirm-plan"]:hover { background: var(--review-primary-dark); }
      button:disabled { cursor: not-allowed; opacity: .38; }
      [data-review-empty] { color: var(--review-text-secondary); margin: 0; padding: 48px 24px; text-align: center; }
      [data-review-resize-edge] {
        bottom: 0;
        cursor: ew-resize;
        position: absolute;
        top: 0;
        touch-action: none;
        width: 12px;
        z-index: 4;
      }
      [data-review-resize-edge="left"] { left: -6px; }
      [data-review-resize-edge="right"] { right: -6px; }
      @media (max-width: 760px) {
        [data-review-panel-titlebar] { gap: 8px; grid-template-columns: minmax(160px, 1fr) auto; }
        [data-review-status-summary] { display: none; }
        [data-review-layout] { grid-template-columns: minmax(180px, 35%) minmax(0, 1fr); }
        [data-review-implementation-grid], [data-module-io] { grid-template-columns: 1fr; }
        [data-review-detail-scroll], [data-review-footer] { padding-left: 16px; padding-right: 16px; }
      }
    `;
  }

  function panelMarkup(state, collapsed, evidenceStatus, options = {}) {
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
    const counts = countReviewConclusions(state.cards);
    const statusSummary = `<div data-review-status-summary aria-label="评审状态统计">${REVIEW_CONCLUSIONS
      .map((status) => statusBadgeMarkup(status, counts[status]))
      .join("")}</div>`;
    const contextLabel = state.schemaVersion === 2
      ? `第 ${state.reviewRound} 轮 · ${displayIndex}/${contextLength} 个模块`
      : `${escape(reviewDomain)} · ${displayIndex}/${contextLength} · 会话 ${sessionCount} · 目标 ${objectiveCount}`;
    const header = `<header data-review-panel-titlebar><div data-review-heading><strong data-review-title>${escape(state.deliveryUnitName)} 功能评审</strong><span data-review-context>${contextLabel}</span></div>${statusSummary}<button type="button" data-action="toggle-collapse">${collapsed ? "展开" : "收起"}</button></header>`;
    const handles = resizeHandlesMarkup(options.dockSide);
    if (collapsed) return `${handles}${header}`;
    const errorMarkup = state.lastError ? `<p data-review-error>${escape(state.lastError.message)}</p>` : "";
    const evidenceMarkup = evidenceStatus ? `<p data-review-evidence-status>${escape(evidenceStatus.message)}</p>` : "";
    const savedLabel = state.saveState === "saved" ? "文档已保存" : state.saveState === "pending" ? "内容已确认，等待保存" : "文档未保存";
    let workflowLabel = state.mode === "reviewing"
      ? "意见已提交，等待 Agent 处理。请回到对话发送“已提交”；页面暂不支持自动唤醒。"
      : state.mode === "result" ? "Agent 已整理本轮意见，请核对拟更新内容后确认保存。"
      : state.mode === "confirmed" ? (state.saveState === "saved" ? "已读取保存回执。" : "已确认本轮内容，正在等待 Agent 写入并读回验证。")
      : "发现遗漏？直接在 Agent 对话中补充，这里保留逐项评审意见。";
    const notice = state.notification;
    if (notice?.status === "connecting") workflowLabel = "正在连接当前任务的自动通知通道。";
    if (state.mode === "input" && notice?.status === "ready") workflowLabel = "自动通知已连接。提交评审后，Agent 会自动继续处理；补充功能仍在对话中进行。";
    if (notice?.status === "sending") workflowLabel = "意见已保留，正在通知 Agent。";
    if (notice?.status === "queued" && state.mode !== "confirmed") workflowLabel = notice.event === "plan-confirm-requested"
      ? "保存确认已通知 Agent，等待读取当前确认并写入。"
      : state.mode === "reviewing" ? "意见已提交，已自动通知 Agent，等待处理。" : workflowLabel;
    if (notice?.status === "failed") workflowLabel = "自动通知未确认成功，评审意见仍已保留。请回到对话发送“已提交”或“已确认保存”。";
    const alerts = `<div data-review-alerts>${errorMarkup}${evidenceMarkup}<p data-review-workflow-status>${workflowLabel}</p><span data-review-save-status>${savedLabel}</span></div>`;
    if (!isResultMode && state.cards.length === 0) {
      return `${handles}${header}<div data-review-body>${alerts}<p data-review-empty>本轮没有需要评审的卡片</p></div>`;
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
        ? `<article data-review-result data-result-id="${escape(result.id)}"><div data-review-card-header><h2 data-review-card-title>${escape(result.moduleName || result.id)}</h2>${statusBadgeMarkup(result.conclusion)}</div>${result.summary ? `<p data-result-summary>${escape(result.summary)}</p>` : ""}${result.planChangeSummary ? `<p data-result-plan-change-summary>${escape(result.planChangeSummary)}</p>` : ""}</article>`
        : "<p>没有返回项</p>";
      const confirmationMarkup = lastResult
        ? `<div data-review-actions><button type="button" data-action="confirm-plan"${state.mode === "confirmed" || confirmationError ? " disabled" : ""}>确认更新 Plan</button>${confirmationError ? `<p data-review-confirm-blocked>${escape(confirmationError.message)}</p>` : ""}</div>`
        : "";
      const resultList = reviewListMarkup(state.results, state.currentResultIndex, "result");
      const footer = `<footer data-review-footer><div data-review-navigation><button type="button" data-action="previous"${state.currentResultIndex === 0 ? " disabled" : ""}>上一个</button><button type="button" data-action="next"${lastResult ? " disabled" : ""}>下一个</button></div>${confirmationMarkup}</footer>`;
      return `${handles}${header}<div data-review-body>${alerts}<div data-review-layout>${resultList}<main data-review-detail><div data-review-detail-scroll>${resultMarkup}</div>${footer}</main></div></div>`;
    }
    const card = currentCard || { id: "", conclusion: "", userNote: "" };
    const lastCard = state.currentCardIndex >= state.cards.length - 1;
    const conclusionGroup = `<div data-review-conclusion-label><span>评审结论</span><div data-review-conclusion-group role="radiogroup" aria-label="评审结论">${REVIEW_CONCLUSIONS
      .map((value) => {
        return `<button type="button" data-action="select-conclusion" data-value="${value}" role="radio" aria-checked="${value === card.conclusion}" aria-pressed="${value === card.conclusion}"${disabled}>${value}</button>`;
      })
      .join("")}</div></div>`;
    const moduleBody = card.module ? moduleMarkup(card) : `${implementationPlanMarkup(card)}<details data-review-implementation-evidence><summary>实现依据</summary><div data-card-fields>${cardFieldsMarkup(card)}</div></details>`;
    const cardMarkup = `<article data-review-card data-card-id="${escape(card.id)}"><div data-review-card-header><h2 data-review-card-title>${escape(card.module?.name || card.id)}</h2>${readinessMarkup(card)}${statusBadgeMarkup(card.conclusion)}</div>${moduleBody}${conclusionGroup}<label>评审备注<textarea data-field="userNote"${disabled}>${escape(card.userNote || "")}</textarea></label></article>`;
    const cardList = reviewListMarkup(state.cards, state.currentCardIndex, "card", state.allCards);
    const footer = `<footer data-review-footer><div data-review-navigation><button type="button" data-action="previous"${disabled || state.currentCardIndex === 0 ? " disabled" : ""}>上一个</button><button type="button" data-action="next"${disabled || lastCard ? " disabled" : ""}>下一个</button></div><div data-review-actions><button type="button" data-action="highlight-evidence"${disabled}>查看证据</button>${lastCard ? `<button type="button" data-action="submit"${disabled}>统一提交评审</button>` : ""}</div></footer>`;
    return `${handles}${header}<div data-review-body>${alerts}<div data-review-layout>${cardList}<main data-review-detail><div data-review-detail-scroll>${cardMarkup}</div>${footer}</main></div></div>`;
  }

  function statusBadgeMarkup(status, count) {
    const suffix = Number.isInteger(count) ? `<span>${count}</span>` : "";
    return `<span data-review-status data-status="${escapeHtml(status)}">${escapeHtml(status)}${suffix}</span>`;
  }

  function reviewListMarkup(items, currentIndex, kind, allCards = items) {
    const byId = new Map(allCards.map(card => [card.id, card]));
    const visibleIds = new Set(items.map(card => card.id));
    const indexAttribute = kind === "result" ? "data-result-index" : "data-card-index";
    const action = kind === "result" ? "select-result" : "select-card";
    const buttons = items.map((item, index) => {
      const title = item.module?.name || item.moduleName || item.reviewGoal || item.id;
      let parent = item.module?.parentId;
      let depth = 0;
      const visited = new Set();
      while (parent && !visited.has(parent)) {
        visited.add(parent); depth += 1; parent = byId.get(parent)?.module?.parentId;
      }
      const hiddenParent = item.module?.parentId && !visibleIds.has(item.module.parentId)
        ? ` · 属于${byId.get(item.module.parentId)?.module?.name || item.module.parentId}` : "";
      const meta = item.module ? `${item.id} · 第 ${item.module.revision} 版${hiddenParent}` : item.dimension || "未分类";
      return `<button type="button" data-review-list-item style="--review-depth:${depth}"${item.module?.parentId ? " data-child-module" : ""} data-action="${action}" ${indexAttribute}="${index}" aria-current="${index === currentIndex}"><span data-review-item-title>${escapeHtml(title)}</span><span data-review-item-meta><span>${escapeHtml(meta)}</span>${statusBadgeMarkup(item.conclusion)}</span>${item.module ? readinessMarkup(item) : ""}</button>`;
    }).join("");
    return `<nav data-review-list aria-label="评审功能列表"><span data-review-list-label>功能模块</span>${buttons}</nav>`;
  }

  function resizeHandlesMarkup(dockSide) {
    const side = DOCK_SIDES.has(dockSide) ? dockSide : "right";
    if (side === "left") return '<div data-review-resize-edge="right" aria-hidden="true"></div>';
    if (side === "right") return '<div data-review-resize-edge="left" aria-hidden="true"></div>';
    return '<div data-review-resize-edge="left" aria-hidden="true"></div><div data-review-resize-edge="right" aria-hidden="true"></div>';
  }

  function readinessMarkup(card) {
    const status = card.implementationPlan?.status;
    if (!status) return "";
    return `<span data-review-readiness="${status}">${status === "ready" ? "实现方案已就绪" : "实现方案待补充"}</span>`;
  }

  function moduleMarkup(card) {
    const m = card.module;
    const changes = { added: "新增", modified: "修改", removed: "移除", unchanged: "保留" };
    const section = (title, values) => `<section data-module-section><h3>${title}</h3>${listMarkup(values)}</section>`;
    const scenarios = m.scenarios.map(item => `<div data-module-scenario><p><b>给定</b>${escapeHtml(item.given)}</p><p><b>当</b>${escapeHtml(item.when)}</p><p><b>则</b>${escapeHtml(item.then)}</p></div>`).join("");
    const questions = m.questions.length ? m.questions.map(item => `<div data-module-question><p><strong>${escapeHtml(item.question)}</strong></p><p>影响：${escapeHtml(item.impact)}</p><p>${item.owner === "agent" ? "Agent 查证" : "需要你决定"}：${escapeHtml(item.recommendation)}</p></div>`).join("") : "<p>暂无待确认问题</p>";
    return `<div data-module-content><section data-module-section><h3>职责与范围</h3><p>${escapeHtml(m.purpose)}</p></section><section data-module-section data-module-change><h3>本次${changes[m.change.kind]}</h3><p>${escapeHtml(m.change.summary)}</p></section><div data-module-io>${section("输入", m.inputs)}${section("输出", m.outputs)}</div>${section("行为规则", m.rules)}<section data-module-section><h3>验收例子</h3>${scenarios}</section><section data-module-section><h3>待确认问题</h3>${questions}</section><details data-module-technical data-review-implementation-evidence><summary>内部实现与依据 · ${card.implementationPlan.status === "ready" ? "已就绪" : "待补充"}</summary><div>${implementationPlanMarkup(card)}<div data-card-fields>${cardFieldsMarkup(card)}</div></div></details></div>`;
  }

  function implementationPlanMarkup(card) {
    const plan = card.implementationPlan;
    if (!plan) return "";
    const blocked = plan.status === "blocked"
      ? `<div data-review-implementation-blocked><strong>实现方案待补充（不影响需求确认）</strong>${listMarkup(plan.blockers)}</div>`
      : "";
    const sections = [
      ["structure", "怎么实现", plan.structure],
      ["linkage", "怎么联动", plan.linkage],
      ["data", "数据怎么走", plan.dataFlow],
      ["acceptance", "怎么验收", plan.acceptanceFocus],
    ].map(([key, label, values]) =>
      `<section data-review-implementation-section="${key}"><h3>${label}</h3>${listMarkup(values)}</section>`,
    ).join("");
    return `${blocked}<div data-review-implementation-summary><strong>一句话实施方案</strong><span>${escapeHtml(plan.summary)}</span></div><div data-review-implementation-grid>${sections}</div>`;
  }

  function listMarkup(values) {
    if (!Array.isArray(values) || values.length === 0) return "<p>待确认</p>";
    return `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
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
      .map(([field, label]) => `<p data-card-field="${field}"><strong>${label}</strong><span>${escapeHtml(formatFieldValue(card[field]))}</span></p>`)
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
    if (
      Object.hasOwn(patch, "conclusion") &&
      USER_CONCLUSIONS.has(patch.conclusion)
    ) {
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

  function selectCurrentCard(state, index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.cards.length || index === state.currentCardIndex) {
      return state;
    }
    return { ...state, currentCardIndex: index };
  }

  function moveCurrentResult(state, direction) {
    const lastResultIndex = Math.max(0, state.results.length - 1);
    const currentResultIndex = clamp(state.currentResultIndex + direction, 0, lastResultIndex);
    if (currentResultIndex === state.currentResultIndex) return state;
    return { ...state, currentResultIndex };
  }

  function selectCurrentResult(state, index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.results.length || index === state.currentResultIndex) {
      return state;
    }
    return { ...state, currentResultIndex: index };
  }

  function submit(state) {
    if (state.cards.length === 0) {
      return { ...state, lastError: reviewError("no-active-cards", "没有可提交的本轮评审卡。") };
    }
    if (!Number.isSafeInteger(state.submissionVersion + 1)) {
      return { ...state, lastError: reviewError("submission-version-exhausted", "请使用新的评审会话重新挂载。") };
    }
    // A fresh nonce also protects against legacy/missing/disabled draft storage.
    const submissionId = globalThis.crypto.randomUUID();
    const submissionVersion = state.submissionVersion + 1;
    const snapshot = deepFreeze({
      sessionId: state.sessionId,
      submissionId,
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
      action.submissionVersion !== state.submissionVersion ||
      action.submissionId !== state.lastSubmission?.submissionId
    ) {
      return { ...state, lastError: reviewError("stale-result", "已忽略过期的评审结果。") };
    }

    const fingerprintError = assertCurrentFingerprints(state, action);
    if (fingerprintError) return { ...state, lastError: fingerprintError };

    if (!Array.isArray(action.results)) {
      return { ...state, lastError: reviewError("invalid-results", "评审结果必须覆盖本轮全部卡片，包含有效卡片关联、唯一结果编号、结论说明和 Plan 变更摘要。") };
    }
    if (action.results.length === 0) {
      return { ...state, lastError: reviewError("empty-results", "空评审结果不能确认更新 Plan。") };
    }
    let results;
    try {
      results = action.results.map(normalizeReviewResult);
      const cardIds = new Set(state.lastSubmission.cards.map((card) => card.id));
      const covered = new Set();
      const resultIds = new Set();
      for (const result of results) {
        if (resultIds.has(result.id)) throw new Error("Duplicate result id");
        resultIds.add(result.id);
        for (const cardId of result.cardIds) {
          if (!cardIds.has(cardId)) throw new Error("Unknown review card");
          covered.add(cardId);
        }
      }
      if (covered.size !== cardIds.size) throw new Error("Incomplete result coverage");
    } catch {
      return { ...state, lastError: reviewError("invalid-results", "评审结果必须覆盖本轮全部卡片，包含有效卡片关联、唯一结果编号、结论说明和 Plan 变更摘要。") };
    }

    return {
      ...state,
      mode: "result",
      cards: state.cards.map(card => {
        const matches = prioritizeReviewResults(results.filter(result => result.cardIds.includes(card.id)));
        const result = matches[0];
        return { ...card, reviewResult: normalizeEmbeddedReviewResult(result),
          reopened: RESOLVED_CONCLUSIONS.has(result.conclusion) ? false : card.reopened,
          evidenceChanged: RESOLVED_CONCLUSIONS.has(result.conclusion) ? false : card.evidenceChanged };
      }),
      results: prioritizeReviewResults(results).map(result => ({
        ...result,
        moduleName: result.cardIds.map(id => state.cards.find(card => card.id === id)?.module?.name).filter(Boolean).join("、"),
      })),
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
      !RESULT_CONCLUSIONS.has(result.conclusion) ||
      !isStringArray(result.cardIds) || result.cardIds.length === 0 ||
      new Set(result.cardIds).size !== result.cardIds.length ||
      !isNonEmptyString(result.summary) || !isNonEmptyString(result.planChangeSummary)
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
      cardIds: [...result.cardIds],
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
      submissionId: state.lastSubmission?.submissionId,
      planFingerprint: state.planFingerprint,
      artifactRuleFingerprint: state.artifactRuleFingerprint,
    });
    const sameIdentity = (left, right) => (
      left.sessionId === right.sessionId &&
      left.submissionVersion === right.submissionVersion &&
      left.submissionId === right.submissionId &&
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
      peek() {
        return pending ? { ...pending } : null;
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
    clampPanelWidth,
    clampPanelPosition,
    countReviewConclusions,
    createCleanupRegistry,
    createPlanConfirmationGate,
    createReviewState,
    createWakeNotifier,
    restoreSubmittedReview,
    DRAFT_TTL_MS,
    highlightEvidence,
    loadDraft,
    PANEL_WIDTH_LIMITS,
    panelMarkup,
    prioritizeReviewResults,
    reduceReviewState,
    resizePanelGeometry,
    resolveDockSide,
    restoreDraft,
    sanitizeDraft,
    saveDraft,
    selectRoundCards,
    mountReviewPanel,
    mergeReviewSession,
    normalizeModule,
  };
});
