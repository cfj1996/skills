"use strict";

function countByStatus(items = [], field = "status") {
  const counts = items.reduce((counts, item) => {
    const value = item?.[field];
    if (typeof value === "string" && value.length > 0) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  }, new Map());

  return Object.fromEntries(counts);
}

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function calculateObjectiveMetrics(model = {}) {
  const tasks = (model.tasks || []).filter((item) => item.status !== "不适用");
  const completed = tasks.filter((item) => ["已完成", "已验证"].includes(item.status)).length;
  const verified = tasks.filter((item) => item.status === "已验证").length;
  const reviewByStatus = countByStatus(model.reviewCards, "conclusion");

  return {
    review: {
      total: (model.reviewCards || []).length,
      byStatus: reviewByStatus,
      pendingRecheck:
        (reviewByStatus["未评审"] || 0) +
        (reviewByStatus["待修改"] || 0) +
        (reviewByStatus["阻塞"] || 0),
    },
    features: countByStatus(model.features),
    tasks: {
      total: tasks.length,
      completed,
      verified,
      completionRate: percentage(completed, tasks.length),
      verificationRate: percentage(verified, tasks.length),
    },
    apis: countByStatus(model.apis),
    dependencies: countByStatus(model.dependencies),
    acceptances: countByStatus(model.acceptances),
    draftOperationCount: (model.draftOperations || []).length,
  };
}

module.exports = { calculateObjectiveMetrics, countByStatus };
