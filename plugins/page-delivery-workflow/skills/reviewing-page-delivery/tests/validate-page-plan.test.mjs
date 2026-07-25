import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  STATUS_MODEL,
  assertArtifactLocationRule,
  validatePagePlanModel,
} = require("../scripts/validate-page-plan.js");
const validModel = JSON.parse(readFileSync(new URL("./fixtures/page-plan-model.json", import.meta.url), "utf8"));
const errorMessages = (result) => result.errors.map((error) => error.message).join("\n");

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test("accepts a normalized model with reciprocal links", () => {
  assert.deepEqual(validatePagePlanModel(validModel), { valid: true, errors: [] });
});

test("rejects an unsupported status", () => {
  const model = structuredClone(validModel);
  model.deliveryUnit.status = "快完成了";
  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.match(errorMessages(result), /deliveryUnit\.status/);
  assert.equal(result.errors[0].code, "unsupported-status");
});

test("accepts page or module delivery units and rejects other scopes", () => {
  const moduleModel = structuredClone(validModel);
  moduleModel.deliveryUnit.kind = "module";
  assert.equal(validatePagePlanModel(moduleModel).valid, true);

  moduleModel.deliveryUnit.kind = "project";
  const result = validatePagePlanModel(moduleModel);
  assert.equal(result.valid, false);
  assert.match(errorMessages(result), /deliveryUnit\.kind/);
});

test("requires every feature to classify its own API need with decision evidence", () => {
  const noApiNeed = structuredClone(validModel);
  noApiNeed.features[0].apiNeed = "none";
  noApiNeed.features[0].apiDecisionEvidenceRefs = ["E-001"];
  noApiNeed.features[0].apiRefs = [];
  noApiNeed.apis = [];
  noApiNeed.tasks[0].apiRefs = [];
  assert.equal(validatePagePlanModel(noApiNeed).valid, true);

  const missingEvidence = structuredClone(noApiNeed);
  missingEvidence.features[0].apiDecisionEvidenceRefs = [];
  assert.match(errorMessages(validatePagePlanModel(missingEvidence)), /API decision evidence/);

  const leakedModuleConclusion = structuredClone(noApiNeed);
  leakedModuleConclusion.features[0].apiRefs = ["API-001"];
  leakedModuleConclusion.apis = structuredClone(validModel.apis);
  assert.match(errorMessages(validatePagePlanModel(leakedModuleConclusion)), /apiNeed none.*apiRefs/i);
});

test("requires every Plan feature to preserve a ready evidence-backed implementation contract", () => {
  const missing = structuredClone(validModel);
  delete missing.features[0].implementationPlan;
  assert.match(errorMessages(validatePagePlanModel(missing)), /implementationPlan is required/);

  const incomplete = structuredClone(validModel);
  incomplete.features[0].implementationPlan.linkage = [];
  assert.match(errorMessages(validatePagePlanModel(incomplete)), /implementationPlan\.linkage/);

  const blocked = structuredClone(validModel);
  blocked.features[0].implementationPlan.status = "blocked";
  blocked.features[0].implementationPlan.blockers = ["组件体系尚未确认"];
  assert.match(errorMessages(validatePagePlanModel(blocked)), /implementationPlan\.status must be ready/);

  const unsupportedEvidence = structuredClone(validModel);
  unsupportedEvidence.features[0].implementationPlan.evidenceIds = ["E-404"];
  assert.match(errorMessages(validatePagePlanModel(unsupportedEvidence)), /implementationPlan\.evidenceIds references missing evidence id: E-404/);
});

test("requires API facts to separate capability, runtime scope, and delivery relation", () => {
  const model = structuredClone(validModel);
  model.features[0].apiNeed = "required";
  model.features[0].apiDecisionEvidenceRefs = ["E-001"];
  model.apis[0].status = "已有正式契约";
  model.apis[0].capabilityDomain = "身份与会话";
  model.apis[0].runtimeScopes = ["application", "session"];
  model.apis[0].formalSourceEvidenceRefs = ["E-001"];
  model.apis[0].deliveryRelations = [
    { featureRef: "F-001", relation: "直接消费" },
  ];
  assert.equal(validatePagePlanModel(model).valid, true);

  for (const field of ["capabilityDomain", "runtimeScopes", "formalSourceEvidenceRefs", "deliveryRelations"]) {
    const missing = structuredClone(model);
    delete missing.apis[0][field];
    assert.match(errorMessages(validatePagePlanModel(missing)), new RegExp(field));
  }
});

test("accepts inherited API dependencies without inventing implementation tasks", () => {
  const model = structuredClone(validModel);
  model.features[0].apiNeed = "required";
  model.features[0].apiDecisionEvidenceRefs = ["E-001"];
  model.features[0].taskRefs = [];
  model.apis[0].status = "已有正式契约";
  model.apis[0].capabilityDomain = "身份与会话";
  model.apis[0].runtimeScopes = ["application", "session"];
  model.apis[0].formalSourceEvidenceRefs = ["E-001"];
  model.apis[0].deliveryRelations = [
    { featureRef: "F-001", relation: "继承依赖" },
  ];
  model.apis[0].taskRefs = [];
  model.tasks = [];
  assert.equal(validatePagePlanModel(model).valid, true);
});

test("does not model no-API decisions as API statuses", () => {
  assert.ok(STATUS_MODEL.api.includes("已有正式契约"));
  assert.ok(STATUS_MODEL.api.includes("正式契约缺失"));
  assert.ok(!STATUS_MODEL.api.includes("不涉及接口"));
  assert.ok(!STATUS_MODEL.api.includes("不适用"));
});

test("requires an AGENTS-owned artifact location rule without defaults", () => {
  const missing = structuredClone(validModel);
  delete missing.artifactLocationRule;
  assert.match(errorMessages(validatePagePlanModel(missing)), /artifactLocationRule/);

  const unresolved = structuredClone(validModel);
  unresolved.artifactLocationRule.source = "candidate";
  assert.match(errorMessages(validatePagePlanModel(unresolved)), /artifactLocationRule\.source/);
});

test("rejects missing and one-way references", () => {
  const model = structuredClone(validModel);
  model.apis[0].featureRefs = [];
  model.tasks[0].apiRefs = ["API-404"];
  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.match(errorMessages(result), /reciprocal|API-404/);
});

test("does not accept markdown as input", () => {
  const result = validatePagePlanModel("# 页面 Plan");
  assert.equal(result.valid, false);
  assert.match(errorMessages(result), /normalized object/);
});

test("rejects empty or whitespace-only IDs", () => {
  for (const id of ["", "   "]) {
    const model = structuredClone(validModel);
    model.features[0].id = id;
    assert.match(errorMessages(validatePagePlanModel(model)), /features item requires id/);
  }
});

test("keeps validation errors from every duplicate source item", () => {
  const model = structuredClone(validModel);
  model.features[0].status = "坏状态一";
  model.features[0].apiRefs = ["API-404-A"];
  model.features.push({ ...structuredClone(validModel.features[0]), id: "F-001", status: "坏状态二", apiRefs: ["API-404-B"] });

  const errors = errorMessages(validatePagePlanModel(model));
  assert.match(errors, /features duplicate id: F-001/);
  assert.match(errors, /坏状态一/);
  assert.match(errors, /API-404-A/);
  assert.match(errors, /坏状态二/);
  assert.match(errors, /API-404-B/);
});

test("requires every indexed collection to be an array", () => {
  for (const collectionName of ["features", "uiStates", "apis", "dependencies", "tasks", "acceptances", "evidence"]) {
    const missing = structuredClone(validModel);
    delete missing[collectionName];
    assert.match(errorMessages(validatePagePlanModel(missing)), new RegExp(`${collectionName} requires an array`));

    const nonArray = structuredClone(validModel);
    nonArray[collectionName] = {};
    assert.match(errorMessages(validatePagePlanModel(nonArray)), new RegExp(`${collectionName} requires an array`));
  }
});

test("accumulates structural errors for primitive collection items and non-array refs", () => {
  const model = structuredClone(validModel);
  model.features = [null, "not-an-object", 7, model.features[0]];
  model.features[3].apiRefs = "API-001";

  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((error) => error.message === "features item requires id").length, 3);
  assert.match(errorMessages(result), /features F-001 apiRefs requires an array/);
});

test("accepts prototype-named IDs through Map indexes", () => {
  const model = structuredClone(validModel);
  model.evidence[0].id = "__proto__";
  model.features[0].apiDecisionEvidenceRefs = ["__proto__"];
  model.features[0].implementationPlan.evidenceIds = ["__proto__"];
  model.apis[0].formalSourceEvidenceRefs = ["__proto__"];
  for (const collectionName of ["features", "uiStates", "apis", "dependencies", "tasks", "acceptances"]) {
    model[collectionName][0].evidenceRefs = ["__proto__"];
  }
  assert.deepEqual(validatePagePlanModel(model), { valid: true, errors: [] });
});

test("requires each reciprocal relationship from either direction", () => {
  const cases = [
    ["feature to API", (model) => { model.apis[0].featureRefs = []; }, /reciprocal feature\/API/],
    ["API to feature", (model) => { model.features[0].apiRefs = []; }, /reciprocal feature\/API/],
    ["feature to task", (model) => { model.tasks[0].featureRefs = []; }, /reciprocal feature\/task/],
    ["task to feature", (model) => { model.features[0].taskRefs = []; }, /reciprocal feature\/task/],
    ["API to task", (model) => { model.tasks[0].apiRefs = []; }, /reciprocal API\/task/],
    ["task to API", (model) => { model.apis[0].taskRefs = []; }, /reciprocal API\/task/],
  ];

  for (const [direction, update, expectedError] of cases) {
    const model = structuredClone(validModel);
    update(model);
    assert.match(errorMessages(validatePagePlanModel(model)), expectedError, direction);
  }
});

test("accepts every declared status and rejects an unsupported value for each status group", () => {
  const groups = [
    ["deliveryUnit", STATUS_MODEL.deliveryUnit, (model) => [model.deliveryUnit]],
    ["feature", STATUS_MODEL.feature, (model) => [model.features[0], model.tasks[0]]],
    ["api", STATUS_MODEL.api, (model) => [model.apis[0]]],
    ["dependency", STATUS_MODEL.dependency, (model) => [model.dependencies[0]]],
    ["acceptance", STATUS_MODEL.acceptance, (model) => [model.acceptances[0]]],
  ];

  for (const [groupName, statuses, selectItems] of groups) {
    for (const status of statuses) {
      const model = structuredClone(validModel);
      for (const item of selectItems(model)) item.status = status;
      assert.equal(validatePagePlanModel(model).valid, true, `${groupName} accepts ${status}`);
    }

    const model = structuredClone(validModel);
    for (const item of selectItems(model)) item.status = "不在状态模型中";
    assert.equal(validatePagePlanModel(model).valid, false, `${groupName} rejects an unsupported status`);
  }
});

test("does not mutate deeply frozen input and returns stable error order", () => {
  const frozen = deepFreeze(structuredClone(validModel));
  const snapshot = structuredClone(frozen);
  assert.deepEqual(validatePagePlanModel(frozen), { valid: true, errors: [] });
  assert.deepEqual(frozen, snapshot);

  const invalid = structuredClone(validModel);
  invalid.features[0].id = " ";
  invalid.apis[0].featureRefs = ["F-404"];
  assert.deepEqual(validatePagePlanModel(invalid).errors, validatePagePlanModel(invalid).errors);
});

test("validator diagnostics are serializable code-message records with deterministic order", () => {
  const invalid = structuredClone(validModel);
  invalid.features[0].id = " ";
  invalid.features[0].apiRefs = "API-001";
  invalid.apis[0].taskRefs = [];

  const first = validatePagePlanModel(invalid).errors;
  const second = validatePagePlanModel(invalid).errors;
  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
  for (const error of first) {
    assert.deepEqual(Object.keys(error).sort(), ["code", "message"]);
    assert.equal(typeof error.code, "string");
    assert.equal(typeof error.message, "string");
    assert.ok(error.code.length > 0 && error.message.length > 0);
    assert.deepEqual(JSON.parse(JSON.stringify(error)), error);
  }
});

test("reports asymmetric API and task links in deterministic sorted order", () => {
  const model = structuredClone(validModel);
  model.apis[0].taskRefs = [];
  model.tasks[0].featureRefs = [];
  model.features[0].status = "坏状态";

  const first = validatePagePlanModel(model).errors;
  const second = validatePagePlanModel(model).errors;
  assert.deepEqual(first, second);
  assert.deepEqual(first, [...first].sort((left, right) => left.message.localeCompare(right.message, "zh-Hans-CN")));
  assert.match(errorMessages({ errors: first }), /reciprocal API\/task/);
  assert.match(errorMessages({ errors: first }), /reciprocal feature\/task/);
});

test("artifact location rule guard uses a stable code and actionable AGENTS message", () => {
  assert.deepEqual(
    assertArtifactLocationRule(validModel.artifactLocationRule, "sha256:changed-rule"),
    {
      code: "artifact-rule-conflict",
      message: "产物位置规则已变化，请重新解析适用的 AGENTS.md 后再提交。",
    },
  );
  assert.equal(
    assertArtifactLocationRule(validModel.artifactLocationRule, validModel.artifactLocationRule.ruleFingerprint),
    null,
  );
});
