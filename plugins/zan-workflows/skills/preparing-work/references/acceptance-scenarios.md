# Acceptance scenarios

Replay these scenarios before returning a definition. Each outcome is read-only
and ends at `READY_FOR_HANDOFF`, `PENDING`, or `BLOCKED` with the matching
response marker.

| Scenario | Required result |
| --- | --- |
| URL path says Bug but reader returns incompatible type or no item | Preserve type evidence; return `BLOCKED`, with no fallback query by guess. |
| No unique project signal but no hard contradiction | `terminal_state=PENDING`, `routing_status=UNRESOLVED` or `AMBIGUOUS`, `resume.decision=PENDING_PROJECT`, no Git search. A proven hard routing conflict is `BLOCKED`. |
| Two exact project references point to different repositories | Keep both candidates/conflict; ask for one discriminator; do not use CWD. |
| Fixed project/repository disagrees with verified route/fingerprint | Constraint result `FAIL`, terminal `BLOCKED`; do not switch target. |
| `REUSE_FIXED` has a named branch but a required ref/raw/association check is unavailable | Record it as `PENDING`; use terminal `PENDING` with `NEED_CONFIRMATION` or `PENDING_REPO_VERIFICATION`; do not reuse automatically. A proven absence/mismatch is `FAIL` plus `BLOCKED`. |
| `REUSE_FIXED` fixed branch is proven absent or a required check fails while another candidate ref has raw and TAPD association | Keep `resume.selected_ref=null` and `branch_to_create=null`; record `FAIL`/`ABSENT`, return `BLOCKED`, and never select the alternate ref. If evidence is merely unavailable, record `PENDING` and return terminal `PENDING` instead. |
| `AUTO` has `fixed_branch=feature/fixed`, while `feature/other` has stronger historical evidence | Inspect/select only `feature/fixed`; either resume it exactly, preserve it as exact `branch_to_create`, or return `PENDING`/`BLOCKED`. Never select `feature/other`. |
| `CREATE` has `fixed_branch=fixbug/new`, while `feature/old` has raw and TAPD association | Return `FRESH` with `branch_to_create=fixbug/new` and `selected_ref=null` only if exact creation eligibility passes. Never return `RESUME` or select `feature/old`. |
| `CREATE` or `REUSE_FIXED` omits `fixed_branch` | Return `BLOCKED` with an invalid-combination `blocker_reason`; do not discover or select a ref. |
| Exact local and remote fixed refs both pass but have different SHAs | Return `BLOCKED`; do not choose either. When SHAs match, deterministically select the remote ref. |
| Only one required exact local/remote ref is proven present for fixed-branch resume | Return `BLOCKED` for the one-sided hard mismatch. If the other side is merely unavailable rather than absent, return `PENDING`. |
| Multiple candidate refs exist and the first has no raw while a later one has raw plus the TAPD association, and `branch.mode=AUTO` with no fixed branch | Inspect every candidate and select the later evidenced ref as `RESUME`; do not stop at the first missing raw. |
| Previous raw says historical work is excluded while latest TAPD implies more work | Preserve both claims; expose conflict and history policy; do not overwrite old context. |
| Evidence identifies work but user has not confirmed in/out/history scope | Include acceptance criteria, list missing confirmation, use `scope.status=PENDING_CONFIRMATION` and `scope_confidence=LOW`. |
| Fully verified route and resume, but scope is still awaiting confirmation | Return `terminal_state=PENDING`, the complete definition, `blocker_reason`, and `RESOLUTION_PENDING`; do not edit, create raw, or invoke repair. |
| Fully verified route, eligible branch decision, and confirmed scope | Return `terminal_state=READY_FOR_HANDOFF`, `blocker_reason=null`, and `RESOLUTION_READY_FOR_HANDOFF`. |
