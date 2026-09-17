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

function moduleModel() {
  const model = structuredClone(validModel);
  model.schemaVersion = 3;
  model.deliveryUnit.kind = "module";
  model.features[0].reviewConclusion = "已确认";
  model.features[0].module = {
    name: "登录表单",
    parentId: null,
    purpose: "让用户建立登录会话",
    inputs: ["用户输入的账号和密码"],
    outputs: ["登录成功建立会话并跳转；失败展示原因"],
    rules: ["字段校验通过后才请求登录；提交期间阻止重复提交"],
    scenarios: [{ id: "F-001-S-001", given: "用户填写有效凭证", when: "点击登录", then: "建立会话并进入目标页" }],
    questions: [],
    change: { kind: "modified", summary: "补充失败反馈和重复提交保护" },
    revision: 1,
  };
  return model;
}

function addChildModule(model) {
  const child = structuredClone(model.features[0]);
  child.id = "F-002";
  child.module.name = "登录失败反馈";
  child.module.parentId = "F-001";
  child.module.scenarios[0].id = "F-002-S-001";
  child.apiNeed = "none";
  child.apiRefs = [];
  child.taskRefs = [];
  model.features.push(child);
  return child;
}

function markImplementationBlocked(feature) {
  feature.implementationPlan = {
    status: "blocked",
    summary: "行为已明确，待核实登录错误码及对应文案",
    structure: [], linkage: [], dataFlow: [], acceptanceFocus: [], evidenceIds: [],
    blockers: ["需查证正式接口中登录失败的错误码含义"],
  };
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

test("requires a complete implementation contract when ready and permits documented blockers during review", () => {
  const missing = structuredClone(validModel);
  delete missing.features[0].implementationPlan;
  assert.match(errorMessages(validatePagePlanModel(missing)), /implementationPlan is required/);

  const incomplete = structuredClone(validModel);
  incomplete.features[0].implementationPlan.linkage = [];
  assert.match(errorMessages(validatePagePlanModel(incomplete)), /implementationPlan\.linkage/);

  const blocked = structuredClone(validModel);
  blocked.features[0].implementationPlan.status = "blocked";
  blocked.features[0].implementationPlan.blockers = ["组件体系尚未确认"];
  assert.deepEqual(validatePagePlanModel(blocked), { valid: true, errors: [] });
  blocked.deliveryUnit.status = "可实施";
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


test("Plan-only review does not require choosing a future Draft directory", () => {
  const model = structuredClone(validModel);
  delete model.artifactLocationRule.draftOpenApiPattern;
  model.apis.forEach(api => { api.status = "已有正式契约"; });
  assert.equal(validatePagePlanModel(model).valid, true);
  model.apis[0].status = "Draft已确认";
  assert.match(errorMessages(validatePagePlanModel(model)), /draftOpenApiPattern/);
});

test("saves confirmed module requirements independently from blocked implementation preparation", () => {
  const model = moduleModel();
  markImplementationBlocked(model.features[0]);
  for (const status of ["评审中", "阻塞"]) {
    model.deliveryUnit.status = status;
    assert.deepEqual(validatePagePlanModel(model), { valid: true, errors: [] });
  }
  assert.equal(model.features[0].reviewConclusion, "已确认");

  for (const status of ["可实施", "开发中", "待对接", "待验收", "已交付"]) {
    model.deliveryUnit.status = status;
    const result = validatePagePlanModel(model);
    assert.ok(result.errors.some(error => error.code === "feature-implementation-not-ready"), status);
    assert.ok(!result.errors.some(error => error.code === "feature-review-not-confirmed"), status);
  }
});

test("requires actionable blockers without inventing evidence or implementation detail", () => {
  const model = moduleModel();
  markImplementationBlocked(model.features[0]);
  const feature = model.features[0];
  for (const blockers of [undefined, [], [" "], [12]]) {
    feature.implementationPlan.blockers = blockers;
    assert.match(errorMessages(validatePagePlanModel(model)), /blockers must describe at least one unresolved blocker/);
  }
  feature.implementationPlan.blockers = ["待 API 负责人确认错误码"];
  feature.implementationPlan.evidenceIds = ["E-missing"];
  assert.match(errorMessages(validatePagePlanModel(model)), /references missing evidence id: E-missing/);
  feature.implementationPlan.evidenceIds = [];
  feature.implementationPlan.status = "almost-ready";
  assert.match(errorMessages(validatePagePlanModel(model)), /status must be ready or blocked/);
});

test("only confirmed applicable modules can enter implementation stages", () => {
  const model = moduleModel();
  model.deliveryUnit.status = "可实施";
  assert.equal(validatePagePlanModel(model).valid, true);
  for (const conclusion of ["未评审", "待修改", "阻塞"]) {
    model.features[0].reviewConclusion = conclusion;
    assert.match(errorMessages(validatePagePlanModel(model)), /reviewConclusion must be 已确认/);
  }
  model.features[0].reviewConclusion = "不适用";
  markImplementationBlocked(model.features[0]);
  assert.equal(validatePagePlanModel(model).valid, true);

  model.features[0].status = "不适用";
  model.features[0].reviewConclusion = "未评审";
  assert.match(errorMessages(validatePagePlanModel(model)), /reviewConclusion must be 已确认/);
});

test("unresolved user or agent questions block implementation stages even for confirmed ready modules", () => {
  for (const owner of ["user", "agent"]) {
    const model = moduleModel();
    model.features[0].module.questions = [{
      id: "Q-001", question: "失败提示何时消失？", impact: "影响失败交互及验收", owner,
      recommendation: "核实需求和现有行为后确定保留至下次提交",
    }];
    assert.equal(model.features[0].reviewConclusion, "已确认");
    assert.equal(model.features[0].implementationPlan.status, "ready");
    for (const status of ["评审中", "阻塞"]) {
      model.deliveryUnit.status = status;
      assert.equal(validatePagePlanModel(model).valid, true, `${owner} questions can be saved during ${status}`);
    }
    for (const status of ["可实施", "开发中", "待对接", "待验收", "已交付"]) {
      model.deliveryUnit.status = status;
      const result = validatePagePlanModel(model);
      assert.ok(result.errors.some(error => error.code === "feature-module-questions-unresolved"), `${owner} questions block ${status}`);
    }
    model.features[0].reviewConclusion = "不适用";
    assert.equal(validatePagePlanModel(model).valid, true, "excluded modules do not block delivery readiness");
    model.features[0].reviewConclusion = "已确认";
    model.features[0].module.questions = [];
    assert.equal(validatePagePlanModel(model).valid, true, "resolved questions no longer block readiness");
  }
});

test("accepts every module review conclusion without changing implementation or delivery status", () => {
  const model = moduleModel();
  for (const reviewConclusion of ["未评审", "已确认", "待修改", "阻塞", "不适用"]) {
    model.features[0].reviewConclusion = reviewConclusion;
    assert.equal(validatePagePlanModel(model).valid, true, reviewConclusion);
  }
  for (const reviewConclusion of [undefined, "开发中", " "]) {
    model.features[0].reviewConclusion = reviewConclusion;
    assert.match(errorMessages(validatePagePlanModel(model)), /reviewConclusion is unsupported/);
  }
});

test("validates a module tree and rejects missing parents, self references, and ancestor cycles", () => {
  const model = moduleModel();
  const child = addChildModule(model);
  assert.deepEqual(validatePagePlanModel(model), { valid: true, errors: [] });
  child.module.parentId = "F-404";
  assert.match(errorMessages(validatePagePlanModel(model)), /parentId references missing module: F-404/);
  child.module.parentId = child.id;
  assert.match(errorMessages(validatePagePlanModel(model)), /parent cycle/);
  child.module.parentId = "F-001";
  model.features[0].module.parentId = "F-002";
  assert.match(errorMessages(validatePagePlanModel(model)), /parent cycle/);
  model.features[0].module.parentId = null;
  assert.equal(validatePagePlanModel(model).valid, true);
});

test("keeps module, example, and question identities unique across the delivery unit", () => {
  const model = moduleModel();
  const child = addChildModule(model);
  child.module.scenarios[0].id = model.features[0].module.scenarios[0].id;
  const question = { id: "Q-001", question: "错误是否自动消失？", impact: "影响失败提示交互", owner: "user", recommendation: "保留至下次提交" };
  model.features[0].module.questions = [question];
  child.module.questions = [structuredClone(question)];
  const errors = errorMessages(validatePagePlanModel(model));
  assert.match(errors, /scenarios duplicate id: F-001-S-001/);
  assert.match(errors, /questions duplicate id: Q-001/);
  child.id = "F-001";
  assert.match(errorMessages(validatePagePlanModel(model)), /features duplicate id: F-001/);
});

test("requires meaningful module contracts, acceptance examples, question ownership, and revisions", () => {
  const changes = [
    [module => { module.name = " "; }, /module\.name/],
    [module => { delete module.parentId; }, /module\.parentId/],
    [module => { module.purpose = ""; }, /module\.purpose/],
    [module => { module.inputs = []; }, /module\.inputs/],
    [module => { module.outputs = [" "]; }, /module\.outputs/],
    [module => { module.rules = "描述"; }, /module\.rules/],
    [module => { module.scenarios = []; }, /at least one acceptance example/],
    [module => { module.scenarios = [null]; }, /scenarios item requires a normalized object/],
    [module => { module.scenarios[0].then = " "; }, /\.then requires non-empty text/],
    [module => { module.questions = null; }, /questions requires an array/],
    [module => { module.questions = [{ id: "Q-001", question: "谁查证？", impact: "阻塞错误展示", owner: "nobody", recommendation: "读取契约" }]; }, /owner must be user or agent/],
    [module => { module.change = { kind: "pending", summary: "" }; }, /change\.kind/],
    [module => { module.change.summary = " "; }, /change\.summary/],
    [module => { module.revision = 0; }, /revision requires a positive safe integer/],
    [module => { module.revision = 1.5; }, /revision requires a positive safe integer/],
  ];
  for (const [change, expected] of changes) {
    const model = moduleModel();
    change(model.features[0].module);
    assert.match(errorMessages(validatePagePlanModel(model)), expected);
  }
  const model = moduleModel();
  delete model.features[0].module;
  assert.match(errorMessages(validatePagePlanModel(model)), /module requires a normalized object/);
  model.features = [];
  assert.match(errorMessages(validatePagePlanModel(model)), /features requires at least one reviewed module/);
});

test("saves unknown API requirements with explicit gaps while preserving declared reference checks", () => {
  const model = moduleModel();
  const feature = model.features[0];
  feature.apiNeed = "unknown";
  feature.apiDecisionEvidenceRefs = [];
  markImplementationBlocked(feature);
  assert.match(errorMessages(validatePagePlanModel(model)), /unknown requires a module question or non-empty apiEvidenceGap/);
  feature.module.questions = [{ id: "Q-001", question: "错误反馈是否需要补充接口字段？", impact: "无法确定错误文案来源", owner: "agent", recommendation: "先读取正式契约与已有消费代码" }];
  assert.deepEqual(validatePagePlanModel(model), { valid: true, errors: [] });
  feature.module.questions = [];
  feature.apiEvidenceGap = "尚未获得 API 契约访问权限，无法确认错误文案字段";
  assert.equal(validatePagePlanModel(model).valid, true);
  feature.apiDecisionEvidenceRefs = ["E-404"];
  assert.match(errorMessages(validatePagePlanModel(model)), /references missing evidence id: E-404/);
  feature.apiDecisionEvidenceRefs = [];
  feature.apiRefs = ["API-404"];
  assert.match(errorMessages(validatePagePlanModel(model)), /references missing apis id: API-404/);

  feature.apiRefs = [];
  model.apis = [];
  model.tasks[0].apiRefs = [];
  assert.equal(validatePagePlanModel(model).valid, true, "unknown API need can be saved before any API is identified");
});

test("unresolved API needs cannot be marked ready for development even when the implementation claims readiness", () => {
  const model = moduleModel();
  model.features[0].apiNeed = "unknown";
  model.features[0].apiEvidenceGap = "等待核实字段是否由宿主注入";
  for (const status of ["可实施", "开发中", "待对接", "待验收", "已交付"]) {
    model.deliveryUnit.status = status;
    assert.match(errorMessages(validatePagePlanModel(model)), /apiNeed must be resolved/);
  }
  model.deliveryUnit.status = "评审中";
  assert.equal(validatePagePlanModel(model).valid, true);
  model.schemaVersion = 2;
  assert.match(errorMessages(validatePagePlanModel(model)), /apiNeed must be required or none/);
});

test("one module may combine API consumption and inherited dependencies without weakening traceability", () => {
  const model = moduleModel();
  const inherited = structuredClone(model.apis[0]);
  inherited.id = "API-002";
  inherited.status = "已有正式契约";
  inherited.deliveryRelations[0].relation = "继承依赖";
  inherited.taskRefs = [];
  model.apis.push(inherited);
  model.features[0].apiRefs.push(inherited.id);
  assert.equal(validatePagePlanModel(model).valid, true);
  inherited.formalSourceEvidenceRefs = [];
  assert.match(errorMessages(validatePagePlanModel(model)), /formalSourceEvidenceRefs requires formal source search evidence/);
  inherited.formalSourceEvidenceRefs = ["E-001"];
  inherited.featureRefs = [];
  assert.match(errorMessages(validatePagePlanModel(model)), /reciprocal feature\/API link missing/);
});

test("module validation remains non-mutating with deterministic malformed-contract diagnostics", () => {
  const model = moduleModel();
  addChildModule(model);
  const frozen = deepFreeze(model);
  assert.deepEqual(validatePagePlanModel(frozen), { valid: true, errors: [] });
  const malformed = structuredClone(model);
  malformed.features[0].module = false;
  malformed.features[1].module.parentId = "F-002";
  const first = validatePagePlanModel(malformed);
  assert.equal(first.valid, false);
  assert.deepEqual(first, validatePagePlanModel(malformed));
});
