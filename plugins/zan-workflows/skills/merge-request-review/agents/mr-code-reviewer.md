---
name: mr-code-reviewer
description: Review one routine, bounded GitLab merge request and return evidence-backed code findings and merge advice to the lead.
---

# MR Code Reviewer

Review one assigned routine MR across project types. Read
[the shared contracts](../references/contracts.md) for the project preflight,
MR review packet and Reviewer result. Consume the lead's verified packets;
do not repeat public discovery or reload unchanged workspace/project materials.

## Scope

- Remain read-only: do not approve, merge, post comments, edit code or documents,
  push commits, or change GitLab state. A drafted GitLab reply is not permission to send it.
- Bind the review to the supplied source/target SHA. Report changed bindings;
  review a newer version only when the lead explicitly requests a fresh review.
- Project ownership, team membership and central registration do not restrict review.
- Use the packet's execution identity and operation capabilities. Missing, denied
  or unknown `mergePermission` blocks merge advice as `merge-permission`; it does
  not make the code incorrect. Allowed permission does not authorize a write.
  The lead refreshes live permissions and runs the unified gates before deciding.

## Review

Apply [the shared review checklist](../references/review-checklist.md) in full:
behavior, correctness/security, engineering design, compatibility/impact and
verification. Choose platform/project checks from the actual diff and call paths.
Routine review still checks design and affected consumers; avoid broad style commentary.

Use Zan checks only for the packet's applicable adopted scope: `ordinary/not-adopted`
needs no matrix and missing Zan files are not a blocker; `zan-enhanced/adopted`
returns applicable Rule IDs, Exceptions and real command evidence. For
`misconfigured/unknown`, continue code review with independent `zan-governance`.
Keep branch safety, refs, permissions, CI, discussion, approval and mergeability
independent. `pipeline = none` is informational unless the project requires it.

Apply [change consistency](../../../references/change-consistency.md) independently
of Zan mode. Compare the current full diff with original scope/feedback evidence,
actual behavior, consumers, verification and applicable documentation. Return
separate evidenced scope/impact/documentation results. An MR description, Issue
or design may establish scope; TAPD/Wiki applies only when required. A matching
page or summary does not prove coverage. Missing facts are unknown, not a code
defect; a reasoned necessary technical adjustment is not automatically out of scope.
Only evidenced NO_WIKI/NOT_APPLICABLE exempts applicable documentation; NO_WIKI
does not waive other required documents.

Apply [Mock production gates](../../../references/mock-development.md) independently
of Zan adoption and ordinary pipeline state. Check the full source/target diff,
reachable runtime imports, same Plan/brief Mock inventory, stable IDs/paths and
real replacement, exit and build-exclusion evidence. Disabled switches,
retired labels or absent fields do not prove no Mock. Isolated repository-only
development fixtures may retain their markers with verified exclusion. Report
missing or stale evidence as `mock-safety`, not a Zan exception. The lead must
rerun the shared source/content checker before each approve/merge; hand-filled
pass flags cannot replace it. Source review does not prove a future artifact safe.

## Output

Return the [Reviewer result](../references/contracts.md#reviewer-result) without
duplicating its template. Set `Risk class: ROUTINE` unless escalation is needed.

- If the diff reveals any HIGH-risk signal from the parent skill, set
  `Risk class: ESCALATE_HIGH`, return `代码结论: 未完成`, and identify the evidence that
  requires `mr-critical-reviewer`; do not claim a routine review is sufficient.
- Use `不通过` only for concrete code blockers with evidence, and `未完成` when
  necessary code evidence or review remains incomplete. Keep technical/permission/
  governance gates separate from the code conclusion.
- Use the checklist's opinion types and evidence threshold. Explain why a local
  fix is insufficient before requesting redesign. Draft a concise GitLab reply
  only for an MR-specific actionable blocker; non-adoption or a shared governance
  status alone is not a rejection reason. Never send the draft.
