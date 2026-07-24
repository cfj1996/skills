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
  assert.match(result.errors.join("\n"), /deliveryUnit\.status/);
});

test("accepts page or module delivery units and rejects other scopes", () => {
  const moduleModel = structuredClone(validModel);
  moduleModel.deliveryUnit.kind = "module";
  assert.equal(validatePagePlanModel(moduleModel).valid, true);

  moduleModel.deliveryUnit.kind = "project";
  const result = validatePagePlanModel(moduleModel);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /deliveryUnit\.kind/);
});

test("requires an AGENTS-owned artifact location rule without defaults", () => {
  const missing = structuredClone(validModel);
  delete missing.artifactLocationRule;
  assert.match(validatePagePlanModel(missing).errors.join("\n"), /artifactLocationRule/);

  const unresolved = structuredClone(validModel);
  unresolved.artifactLocationRule.source = "candidate";
  assert.match(validatePagePlanModel(unresolved).errors.join("\n"), /artifactLocationRule\.source/);
});

test("rejects missing and one-way references", () => {
  const model = structuredClone(validModel);
  model.apis[0].featureRefs = [];
  model.tasks[0].apiRefs = ["API-404"];
  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /reciprocal|API-404/);
});

test("does not accept markdown as input", () => {
  const result = validatePagePlanModel("# 页面 Plan");
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /normalized object/);
});

test("rejects empty or whitespace-only IDs", () => {
  for (const id of ["", "   "]) {
    const model = structuredClone(validModel);
    model.features[0].id = id;
    assert.match(validatePagePlanModel(model).errors.join("\n"), /features item requires id/);
  }
});

test("keeps validation errors from every duplicate source item", () => {
  const model = structuredClone(validModel);
  model.features[0].status = "坏状态一";
  model.features[0].apiRefs = ["API-404-A"];
  model.features.push({ ...structuredClone(validModel.features[0]), id: "F-001", status: "坏状态二", apiRefs: ["API-404-B"] });

  const errors = validatePagePlanModel(model).errors.join("\n");
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
    assert.match(validatePagePlanModel(missing).errors.join("\n"), new RegExp(`${collectionName} requires an array`));

    const nonArray = structuredClone(validModel);
    nonArray[collectionName] = {};
    assert.match(validatePagePlanModel(nonArray).errors.join("\n"), new RegExp(`${collectionName} requires an array`));
  }
});

test("accumulates structural errors for primitive collection items and non-array refs", () => {
  const model = structuredClone(validModel);
  model.features = [null, "not-an-object", 7, model.features[0]];
  model.features[3].apiRefs = "API-001";

  const result = validatePagePlanModel(model);
  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((error) => error === "features item requires id").length, 3);
  assert.match(result.errors.join("\n"), /features F-001 apiRefs requires an array/);
});

test("accepts prototype-named IDs through Map indexes", () => {
  const model = structuredClone(validModel);
  model.evidence[0].id = "__proto__";
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
    assert.match(validatePagePlanModel(model).errors.join("\n"), expectedError, direction);
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

test("reports asymmetric API and task links in deterministic sorted order", () => {
  const model = structuredClone(validModel);
  model.apis[0].taskRefs = [];
  model.tasks[0].featureRefs = [];
  model.features[0].status = "坏状态";

  const first = validatePagePlanModel(model).errors;
  const second = validatePagePlanModel(model).errors;
  assert.deepEqual(first, second);
  assert.deepEqual(first, [...first].sort((left, right) => left.localeCompare(right, "zh-Hans-CN")));
  assert.match(first.join("\n"), /reciprocal API\/task/);
  assert.match(first.join("\n"), /reciprocal feature\/task/);
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
