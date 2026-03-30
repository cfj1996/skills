# 阶段四：Code Review

## 目标

核对当前轮次实现是否满足需求，并决定是否可进入提交阶段。

## Review 维度

1. 需求一致性
2. 修改范围
3. 代码质量
4. 安全性

## 判定规则

- `confidence >= 0.8` 通过
- 通过时输出 `REVIEW_PASSED`
- 不通过时写入 `review-report.md`

## Review 范围

- 只看本次 diff
- 只看当前轮次的 `change-request.md`、`task-plan.md` 和 `impl-summary.md`
- 历史遗留问题仅作为建议项
