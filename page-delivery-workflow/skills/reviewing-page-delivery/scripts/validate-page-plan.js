const STATUS_MODEL = Object.freeze({
  deliveryUnit: Object.freeze(["评审中", "可实施", "开发中", "待对接", "待验收", "已交付", "阻塞"]),
  feature: Object.freeze(["待实施", "开发中", "已完成", "已验证", "不适用"]),
  api: Object.freeze(["不涉及接口", "Draft已确认", "Mock已接入", "已同步正式契约", "联调中", "已验收", "不适用"]),
  dependency: Object.freeze(["不涉及", "路由契约待确认", "待目标页面实现", "占位页可达", "页面对接中", "已对接", "已验收"]),
  acceptance: Object.freeze(["未验证", "部分通过", "已通过", "验收阻塞"]),
});

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
});

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function indexById(items, collectionName, errors) {
  const index = new Map();
  for (const item of items) {
    addError(errors, item && typeof item.id === "string", `${collectionName} item requires id`);
    if (!item?.id) continue;
    addError(errors, !index.has(item.id), `${collectionName} duplicate id: ${item.id}`);
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
  addError(errors, allowedStatuses.includes(status), `${subject}.status is unsupported: ${String(status)}`);
}

function validateArtifactLocationRule(rule, errors) {
  addError(errors, isNormalizedObject(rule), "artifactLocationRule requires a normalized object");
  if (!isNormalizedObject(rule)) return;

  addError(errors, rule.source === "agents", "artifactLocationRule.source must be agents");
  addError(errors, hasText(rule.ownerFile), "artifactLocationRule.ownerFile is required");
  addError(errors, hasText(rule.planPattern), "artifactLocationRule.planPattern is required");
  addError(errors, hasText(rule.draftOpenApiPattern), "artifactLocationRule.draftOpenApiPattern is required");
  addError(errors, hasText(rule.ruleFingerprint), "artifactLocationRule.ruleFingerprint is required");
}

function validateReferences(indexes, errors) {
  for (const collectionName of COLLECTIONS) {
    for (const item of indexes[collectionName].values()) {
      for (const [refName, targetName] of Object.entries(REF_TARGETS)) {
        if (!(refName in item)) continue;
        addError(errors, Array.isArray(item[refName]), `${collectionName} ${item.id} ${refName} requires an array`);
        if (!Array.isArray(item[refName])) continue;
        for (const reference of item[refName]) {
          addError(
            errors,
            typeof reference === "string" && indexes[targetName].has(reference),
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

function validateReciprocalLinks(indexes, errors) {
  for (const feature of indexes.features.values()) {
    for (const apiId of referencesOf(feature, "apiRefs")) {
      const api = indexes.apis.get(apiId);
      if (api) {
        addError(errors, includesRef(api, "featureRefs", feature.id), `reciprocal feature/API link missing: ${feature.id} ↔ ${apiId}`);
      }
    }
    for (const taskId of referencesOf(feature, "taskRefs")) {
      const task = indexes.tasks.get(taskId);
      if (task) {
        addError(errors, includesRef(task, "featureRefs", feature.id), `reciprocal feature/task link missing: ${feature.id} ↔ ${taskId}`);
      }
    }
  }

  for (const api of indexes.apis.values()) {
    for (const featureId of referencesOf(api, "featureRefs")) {
      const feature = indexes.features.get(featureId);
      if (feature) {
        addError(errors, includesRef(feature, "apiRefs", api.id), `reciprocal feature/API link missing: ${featureId} ↔ ${api.id}`);
      }
    }
    for (const taskId of referencesOf(api, "taskRefs")) {
      const task = indexes.tasks.get(taskId);
      if (task) {
        addError(errors, includesRef(task, "apiRefs", api.id), `reciprocal API/task link missing: ${api.id} ↔ ${taskId}`);
      }
    }
  }

  for (const task of indexes.tasks.values()) {
    for (const featureId of referencesOf(task, "featureRefs")) {
      const feature = indexes.features.get(featureId);
      if (feature) {
        addError(errors, includesRef(feature, "taskRefs", task.id), `reciprocal feature/task link missing: ${featureId} ↔ ${task.id}`);
      }
    }
    for (const apiId of referencesOf(task, "apiRefs")) {
      const api = indexes.apis.get(apiId);
      if (api) {
        addError(errors, includesRef(api, "taskRefs", task.id), `reciprocal API/task link missing: ${apiId} ↔ ${task.id}`);
      }
    }
  }
}

function validatePagePlanModel(model) {
  const errors = [];
  if (!isNormalizedObject(model)) {
    return { valid: false, errors: ["input requires a normalized object"] };
  }

  addError(errors, model.schemaVersion === 1, "schemaVersion must be 1");
  addError(errors, isNormalizedObject(model.deliveryUnit), "deliveryUnit requires a normalized object");
  if (isNormalizedObject(model.deliveryUnit)) {
    addError(errors, ["page", "module"].includes(model.deliveryUnit.kind), "deliveryUnit.kind must be page or module");
    validateStatus(errors, "deliveryUnit", model.deliveryUnit.status, STATUS_MODEL.deliveryUnit);
  }

  validateArtifactLocationRule(model.artifactLocationRule, errors);

  const indexes = {};
  for (const collectionName of COLLECTIONS) {
    const items = model[collectionName];
    addError(errors, Array.isArray(items), `${collectionName} requires an array`);
    indexes[collectionName] = indexById(Array.isArray(items) ? items : [], collectionName, errors);
  }

  for (const feature of indexes.features.values()) {
    validateStatus(errors, `features ${feature.id}`, feature.status, STATUS_MODEL.feature);
  }
  for (const api of indexes.apis.values()) {
    validateStatus(errors, `apis ${api.id}`, api.status, STATUS_MODEL.api);
  }
  for (const dependency of indexes.dependencies.values()) {
    validateStatus(errors, `dependencies ${dependency.id}`, dependency.status, STATUS_MODEL.dependency);
  }
  for (const task of indexes.tasks.values()) {
    validateStatus(errors, `tasks ${task.id}`, task.status, STATUS_MODEL.feature);
  }
  for (const acceptance of indexes.acceptances.values()) {
    validateStatus(errors, `acceptances ${acceptance.id}`, acceptance.status, STATUS_MODEL.acceptance);
  }

  validateReferences(indexes, errors);
  validateReciprocalLinks(indexes, errors);

  return { valid: errors.length === 0, errors };
}

module.exports = { STATUS_MODEL, validatePagePlanModel };
