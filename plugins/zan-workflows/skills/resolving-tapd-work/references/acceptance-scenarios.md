# Acceptance scenarios

Replay these scenarios before returning a definition. Each outcome is read-only
and ends at `STOPPED_FOR_HANDOFF` or `BLOCKED`.

| Scenario | Required result |
| --- | --- |
| URL path says Bug but reader returns incompatible type or no item | Preserve type evidence; return `BLOCKED`, with no fallback query by guess. |
| No unique project signal | `routing_status=UNRESOLVED` or `AMBIGUOUS`, `resume.decision=PENDING_PROJECT`, no Git search. |
| Two exact project references point to different repositories | Keep both candidates/conflict; ask for one discriminator; do not use CWD. |
| Fixed project/repository disagrees with verified route/fingerprint | Constraint result `FAIL`, terminal `BLOCKED`; do not switch target. |
| `REUSE_FIXED` has a named branch but refs, raw, or TAPD association are missing | Record all branch checks and use `NEED_CONFIRMATION` or `PENDING_REPO_VERIFICATION`; do not reuse automatically. |
| Multiple candidate refs exist and the first has no raw while a later one has raw plus the TAPD association | Inspect every candidate and select the later evidenced ref as `RESUME`; do not stop at the first missing raw. |
| Previous raw says historical work is excluded while latest TAPD implies more work | Preserve both claims; expose conflict and history policy; do not overwrite old context. |
| Evidence identifies work but user has not confirmed in/out/history scope | Include acceptance criteria, list missing confirmation, use `scope.status=PENDING_CONFIRMATION` and `scope_confidence=LOW`. |
| Fully verified route and resume, but scope is still awaiting confirmation | Return the complete definition with the pending scope and stop; do not edit, create raw, or invoke repair. |
