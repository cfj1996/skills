import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { calculateObjectiveMetrics, countByStatus } = require("../scripts/calculate-progress.js");

test("counts statuses without inventing an aggregate page percentage", () => {
  const metrics = calculateObjectiveMetrics({
    reviewCards: [
      { conclusion: "已确认" },
      { conclusion: "待修改" },
      { conclusion: "阻塞" },
    ],
    features: [
      { status: "已完成" },
      { status: "已验证" },
      { status: "不适用" },
    ],
    tasks: [
      { status: "已完成" },
      { status: "已验证" },
      { status: "待实施" },
      { status: "不适用" },
    ],
    apis: [{ status: "Mock已接入" }],
    dependencies: [{ status: "路由契约待确认" }],
    acceptances: [{ status: "部分通过" }],
    draftOperations: [{ operationId: "login" }],
  });

  assert.deepEqual(metrics.tasks, {
    total: 3,
    completed: 2,
    verified: 1,
    completionRate: 66.67,
    verificationRate: 33.33,
  });
  assert.equal(metrics.review.byStatus["待修改"], 1);
  assert.equal(metrics.review.pendingRecheck, 2);
  assert.equal(metrics.draftOperationCount, 1);
  assert.equal("pageCompletionRate" in metrics, false);
});

test("returns zero rates for no applicable tasks", () => {
  const metrics = calculateObjectiveMetrics({ tasks: [{ status: "不适用" }] });
  assert.equal(metrics.tasks.total, 0);
  assert.equal(metrics.tasks.completionRate, 0);
  assert.equal(metrics.tasks.verificationRate, 0);
});

test("countByStatus does not mutate input", () => {
  const rows = Object.freeze([Object.freeze({ status: "待实施" })]);
  assert.deepEqual(countByStatus(rows), { "待实施": 1 });
});
