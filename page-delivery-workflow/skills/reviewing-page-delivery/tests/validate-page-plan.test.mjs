import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validatePagePlanModel } = require("../scripts/validate-page-plan.js");

const validModel = {
  schemaVersion: 1,
  deliveryUnit: { id: "UNIT-001", kind: "page", name: "示例登录", status: "评审中" },
  artifactLocationRule: {
    source: "agents",
    ownerFile: "/sample-project/AGENTS.md",
    planPattern: "<project-plan-pattern>",
    draftOpenApiPattern: "<project-draft-pattern>",
    ruleFingerprint: "sha256:rule-fixture",
  },
  features: [{ id: "F-001", status: "待实施", apiRefs: ["API-001"], taskRefs: ["T-001"], evidenceRefs: ["E-001"] }],
  uiStates: [{ id: "UI-001", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  apis: [{ id: "API-001", status: "Draft已确认", featureRefs: ["F-001"], taskRefs: ["T-001"], evidenceRefs: ["E-001"] }],
  dependencies: [{ id: "DEP-001", status: "路由契约待确认", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  tasks: [{ id: "T-001", status: "待实施", featureRefs: ["F-001"], apiRefs: ["API-001"], evidenceRefs: ["E-001"] }],
  acceptances: [{ id: "A-001", status: "未验证", featureRefs: ["F-001"], evidenceRefs: ["E-001"] }],
  evidence: [{ id: "E-001", kind: "prototype", locator: "#login-form" }],
  reviewBatches: [],
};

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
