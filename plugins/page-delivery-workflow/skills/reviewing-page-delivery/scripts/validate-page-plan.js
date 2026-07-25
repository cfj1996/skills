const STATUS_MODEL = Object.freeze({
  deliveryUnit: Object.freeze(["评审中", "可实施", "开发中", "待对接", "待验收", "已交付", "阻塞"]),
  feature: Object.freeze(["待实施", "开发中", "已完成", "已验证", "不适用"]),
  api: Object.freeze(["已有正式契约", "正式契约缺失", "Draft已确认", "Mock已接入", "已同步正式契约", "联调中", "已验收"]),
  dependency: Object.freeze(["不涉及", "路由契约待确认", "待目标页面实现", "占位页可达", "页面对接中", "已对接", "已验收"]),
  acceptance: Object.freeze(["未验证", "部分通过", "已通过", "验收阻塞"]),
});

const API_NEEDS = Object.freeze(["required", "none"]);
const API_DELIVERY_RELATIONS = Object.freeze(["直接消费", "继承依赖", "契约变更"]);

const COLLECTIONS = [
  "features",
  "uiStates",
  "apis",
  "dependencies",
  "tasks",
  "acceptances",
  "evidence",
];

const REF_TARGETS = Object.freeze({
  featureRefs: "features",
  apiRefs: "apis",
  taskRefs: "tasks",
  evidenceRefs: "evidence",
  apiDecisionEvidenceRefs: "evidence",
  formalSourceEvidenceRefs: "evidence",
});

function addError(errors, condition, code, message) {
  if (!condition) errors.push({ code, message });
}

function indexById(items, collectionName, errors) {
  const index = new Map();
  for (const item of items) {
    addError(errors, isNormalizedObject(item) && hasText(item.id), "item-id-required", `${collectionName} item requires id`);
    if (!isNormalizedObject(item) || !hasText(item.id)) continue;
    addError(errors, !index.has(item.id), "duplicate-id", `${collectionName} duplicate id: ${item.id}`);
    if (index.has(item.id)) continue;
    index.set(item.id, item);
  }
  return index;
}

function isNormalizedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStatus(errors, subject, status, allowedStatuses) {
  addError(errors, allowedStatuses.includes(status), "unsupported-status", `${subject}.status is unsupported: ${String(status)}`);
}

function validateNonEmptyTextArray(errors, subject, value) {
  addError(errors, Array.isArray(value), "text-array", `${subject} requires an array`);
  if (!Array.isArray(value)) return;
  addError(
    errors,
    value.length > 0 && value.every(hasText),
    "text-array-content",
    `${subject} requires at least one non-empty string`,
  );
}

function validateArtifactLocationRule(rule, errors) {
  addError(errors, isNormalizedObject(rule), "artifact-rule-object", "artifactLocationRule requires a normalized object");
  if (!isNormalizedObject(rule)) return;

  addError(errors, rule.source === "agents", "artifact-rule-source", "artifactLocationRule.source must be agents");
  addError(errors, hasText(rule.ownerFile), "artifact-rule-owner-file", "artifactLocationRule.ownerFile is required");
  addError(errors, hasText(rule.planPattern), "artifact-rule-plan-pattern", "artifactLocationRule.planPattern is required");
  addError(errors, hasText(rule.draftOpenApiPattern), "artifact-rule-draft-open-api-pattern", "artifactLocationRule.draftOpenApiPattern is required");
  addError(errors, hasText(rule.ruleFingerprint), "artifact-rule-fingerprint", "artifactLocationRule.ruleFingerprint is required");
}

function validateFeatureImplementationPlan(feature, evidenceIndex, errors) {
  const plan = feature.implementationPlan;
  addError(
    errors,
    isNormalizedObject(plan),
    "feature-implementation-plan-required",
    `features ${feature.id} implementationPlan is required`,
  );
  if (!isNormalizedObject(plan)) return;

  addError(
    errors,
    plan.status === "ready",
    "feature-implementation-status",
    `features ${feature.id} implementationPlan.status must be ready`,
  );
  addError(
    errors,
    hasText(plan.summary),
    "feature-implementation-summary",
    `features ${feature.id} implementationPlan.summary is required`,
  );

  for (const field of ["structure", "linkage", "dataFlow", "acceptanceFocus", "evidenceIds"]) {
    validateNonEmptyTextArray(errors, `features ${feature.id} implementationPlan.${field}`, plan[field]);
  }

  addError(
    errors,
    Array.isArray(plan.blockers) && plan.blockers.length === 0,
    "feature-implementation-blockers",
    `features ${feature.id} implementationPlan.blockers must be an empty array`,
  );

  if (!Array.isArray(plan.evidenceIds)) return;
  for (const evidenceId of plan.evidenceIds) {
    addError(
      errors,
      typeof evidenceId === "string" && evidenceIndex.has(evidenceId),
      "feature-implementation-evidence",
      `features ${feature.id} implementationPlan.evidenceIds references missing evidence id: ${String(evidenceId)}`,
    );
  }
}

function assertArtifactLocationRule(rule, currentRuleFingerprint) {
  return (
    !isNormalizedObject(rule) ||
    rule.source !== "agents" ||
    !hasText(rule.ruleFingerprint) ||
    rule.ruleFingerprint !== currentRuleFingerprint
  )
    ? {
      code: "artifact-rule-conflict",
      message: "产物位置规则已变化，请重新解析适用的 AGENTS.md 后再提交。",
    }
    : null;
}

function validateReferences(itemsByCollection, indexes, errors) {
  for (const collectionName of COLLECTIONS) {
    for (const item of itemsByCollection[collectionName]) {
      if (!isNormalizedObject(item)) continue;
      for (const [refName, targetName] of Object.entries(REF_TARGETS)) {
        if (!(refName in item)) continue;
        addError(errors, Array.isArray(item[refName]), "reference-array", `${collectionName} ${item.id} ${refName} requires an array`);
        if (!Array.isArray(item[refName])) continue;
        for (const reference of item[refName]) {
          addError(
            errors,
            typeof reference === "string" && indexes[targetName].has(reference),
            "reference-missing",
            `${collectionName} ${item.id} ${refName} references missing ${targetName} id: ${String(reference)}`,
          );
        }
      }
    }
  }
}

function includesRef(item, refName, id) {
  return Array.isArray(item[refName]) && item[refName].includes(id);
}

function referencesOf(item, refName) {
  return Array.isArray(item[refName]) ? item[refName] : [];
}

function validateReciprocalLinks(itemsByCollection, indexes, errors) {
  for (const feature of itemsByCollection.features) {
    if (!isNormalizedObject(feature)) continue;
    for (const apiId of referencesOf(feature, "apiRefs")) {
      const api = indexes.apis.get(apiId);
      if (api) {
        addError(errors, includesRef(api, "featureRefs", feature.id), "reciprocal-feature-api", `reciprocal feature/API link missing: ${feature.id} ↔ ${apiId}`);
      }
    }
    for (const taskId of referencesOf(feature, "taskRefs")) {
      const task = indexes.tasks.get(taskId);
      if (task) {
        addError(errors, includesRef(task, "featureRefs", feature.id), "reciprocal-feature-task", `reciprocal feature/task link missing: ${feature.id} ↔ ${taskId}`);
      }
    }
  }

  for (const api of itemsByCollection.apis) {
    if (!isNormalizedObject(api)) continue;
    for (const featureId of referencesOf(api, "featureRefs")) {
      const feature = indexes.features.get(featureId);
      if (feature) {
        addError(errors, includesRef(feature, "apiRefs", api.id), "reciprocal-feature-api", `reciprocal feature/API link missing: ${featureId} ↔ ${api.id}`);
      }
    }
    for (const taskId of referencesOf(api, "taskRefs")) {
      const task = indexes.tasks.get(taskId);
      if (task) {
        addError(errors, includesRef(task, "apiRefs", api.id), "reciprocal-api-task", `reciprocal API/task link missing: ${api.id} ↔ ${taskId}`);
      }
    }
  }

  for (const task of itemsByCollection.tasks) {
    if (!isNormalizedObject(task)) continue;
    for (const featureId of referencesOf(task, "featureRefs")) {
      const feature = indexes.features.get(featureId);
      if (feature) {
        addError(errors, includesRef(feature, "taskRefs", task.id), "reciprocal-feature-task", `reciprocal feature/task link missing: ${featureId} ↔ ${task.id}`);
      }
    }
    for (const apiId of referencesOf(task, "apiRefs")) {
      const api = indexes.apis.get(apiId);
      if (api) {
        addError(errors, includesRef(api, "taskRefs", task.id), "reciprocal-api-task", `reciprocal API/task link missing: ${apiId} ↔ ${task.id}`);
      }
    }
  }
}

function validatePagePlanModel(model) {
  const errors = [];
  if (!isNormalizedObject(model)) {
    return { valid: false, errors: [{ code: "input-normalized-object", message: "input requires a normalized object" }] };
  }

  addError(errors, model.schemaVersion === 2, "schema-version", "schemaVersion must be 2");
  addError(errors, isNormalizedObject(model.deliveryUnit), "delivery-unit-object", "deliveryUnit requires a normalized object");
  if (isNormalizedObject(model.deliveryUnit)) {
    addError(errors, ["page", "module"].includes(model.deliveryUnit.kind), "delivery-unit-kind", "deliveryUnit.kind must be page or module");
    validateStatus(errors, "deliveryUnit", model.deliveryUnit.status, STATUS_MODEL.deliveryUnit);
  }

  validateArtifactLocationRule(model.artifactLocationRule, errors);

  const itemsByCollection = {};
  const indexes = {};
  for (const collectionName of COLLECTIONS) {
    const items = model[collectionName];
    addError(errors, Array.isArray(items), "collection-array", `${collectionName} requires an array`);
    itemsByCollection[collectionName] = Array.isArray(items) ? items : [];
    indexes[collectionName] = indexById(itemsByCollection[collectionName], collectionName, errors);
  }

  for (const feature of itemsByCollection.features) {
    if (!isNormalizedObject(feature)) continue;
    validateStatus(errors, `features ${feature.id}`, feature.status, STATUS_MODEL.feature);
    validateFeatureImplementationPlan(feature, indexes.evidence, errors);
    addError(
      errors,
      API_NEEDS.includes(feature.apiNeed),
      "feature-api-need",
      `features ${feature.id} apiNeed must be required or none`,
    );
    addError(
      errors,
      Array.isArray(feature.apiDecisionEvidenceRefs) && feature.apiDecisionEvidenceRefs.length > 0,
      "feature-api-decision-evidence",
      `features ${feature.id} requires API decision evidence`,
    );
    if (feature.apiNeed === "none") {
      addError(
        errors,
        Array.isArray(feature.apiRefs) && feature.apiRefs.length === 0,
        "feature-no-api-refs",
        `features ${feature.id} with apiNeed none must not declare apiRefs`,
      );
    }
    if (feature.apiNeed === "required") {
      addError(
        errors,
        Array.isArray(feature.apiRefs) && feature.apiRefs.length > 0,
        "feature-required-api-refs",
        `features ${feature.id} with apiNeed required must declare apiRefs`,
      );
    }
  }
  for (const api of itemsByCollection.apis) {
    if (!isNormalizedObject(api)) continue;
    validateStatus(errors, `apis ${api.id}`, api.status, STATUS_MODEL.api);
    addError(errors, hasText(api.capabilityDomain), "api-capability-domain", `apis ${api.id} capabilityDomain is required`);
    validateNonEmptyTextArray(errors, `apis ${api.id} runtimeScopes`, api.runtimeScopes);
    addError(
      errors,
      Array.isArray(api.formalSourceEvidenceRefs) && api.formalSourceEvidenceRefs.length > 0,
      "api-formal-source-evidence",
      `apis ${api.id} formalSourceEvidenceRefs requires formal source search evidence`,
    );
    addError(
      errors,
      Array.isArray(api.deliveryRelations),
      "api-delivery-relations",
      `apis ${api.id} deliveryRelations requires an array`,
    );
    if (Array.isArray(api.deliveryRelations)) {
      const relatedFeatureIds = new Set();
      for (const relation of api.deliveryRelations) {
        addError(
          errors,
          isNormalizedObject(relation),
          "api-delivery-relation-object",
          `apis ${api.id} deliveryRelations item requires a normalized object`,
        );
        if (!isNormalizedObject(relation)) continue;
        addError(
          errors,
          typeof relation.featureRef === "string" && indexes.features.has(relation.featureRef),
          "api-delivery-relation-feature",
          `apis ${api.id} deliveryRelations references missing feature: ${String(relation.featureRef)}`,
        );
        addError(
          errors,
          API_DELIVERY_RELATIONS.includes(relation.relation),
          "api-delivery-relation-kind",
          `apis ${api.id} deliveryRelations relation is unsupported: ${String(relation.relation)}`,
        );
        addError(
          errors,
          !relatedFeatureIds.has(relation.featureRef),
          "api-delivery-relation-duplicate",
          `apis ${api.id} deliveryRelations repeats feature: ${String(relation.featureRef)}`,
        );
        relatedFeatureIds.add(relation.featureRef);
      }
      const featureRefs = referencesOf(api, "featureRefs");
      addError(
        errors,
        featureRefs.length === relatedFeatureIds.size &&
          featureRefs.every((featureRef) => relatedFeatureIds.has(featureRef)),
        "api-delivery-relation-coverage",
        `apis ${api.id} deliveryRelations must cover every featureRef exactly once`,
      );
    }
  }
  for (const dependency of itemsByCollection.dependencies) {
    if (!isNormalizedObject(dependency)) continue;
    validateStatus(errors, `dependencies ${dependency.id}`, dependency.status, STATUS_MODEL.dependency);
  }
  for (const task of itemsByCollection.tasks) {
    if (!isNormalizedObject(task)) continue;
    validateStatus(errors, `tasks ${task.id}`, task.status, STATUS_MODEL.feature);
  }
  for (const acceptance of itemsByCollection.acceptances) {
    if (!isNormalizedObject(acceptance)) continue;
    validateStatus(errors, `acceptances ${acceptance.id}`, acceptance.status, STATUS_MODEL.acceptance);
  }

  validateReferences(itemsByCollection, indexes, errors);
  validateReciprocalLinks(itemsByCollection, indexes, errors);

  return {
    valid: errors.length === 0,
    errors: errors.sort((left, right) => left.message.localeCompare(right.message, "zh-Hans-CN") || left.code.localeCompare(right.code, "en")),
  };
}

module.exports = {
  API_DELIVERY_RELATIONS,
  API_NEEDS,
  STATUS_MODEL,
  assertArtifactLocationRule,
  validatePagePlanModel,
};
