# Acceptance scenarios

## Consolidated review and scoped verification

| Scenario | Expected result |
| --- | --- |
| Stable component fix plus consumer version upgrade, STANDARD | Each changed repository retains its own code review. Review the complete submission/Wiki plan once; scripts check Git, queue, Wiki and registration in dependency order and the lead checks final receipts. No per-stage Agent calls for unchanged facts. |
| Standalone NO_WIKI plan has not yet received human confirmation | Review the exact proposed plan with authority pending, without loading Wiki or demanding future queue/MR readbacks. PLAN writes nothing; EXECUTE waits for matching actual human approval. |
| Developer edits were reviewed but the Bug completion comment still needs the approved correction | Whole-plan review accepts only the existing narrow PLAN exception with current code/proposed-comment reviews, history and all repositories verified. Correction/reuse and exact readback run first; restore full REVIEWED before any commit/push/MR, build, Wiki or registration. Never defer code review or invent a completed comment. |
| Commit creates a new SHA with exactly the reviewed content | Verify content/diff/dependency/environment correspondence and update the in-memory binding; do not rerun code review solely for the new SHA. A target's additional unreviewed diff still needs scoped review. |
| Parent build succeeds and workers exit within the bounded shutdown grace | Return PASSED after natural exit and verified group cleanup; do not rerun build merely because the parent exited before a worker. Persistent workers remain a failed check and are terminated. |
| Planned commit has missing Husky init, incompatible local commitlint/Node or invalid body | Read-only commit preflight blocks with diagnostics before commit. Repair the exact cause, never skip Hooks or download a new linter to make the check pass. |
| Wiki update result is unknown or the body gained an unreviewed semantic change | Unknown effects stop dependent registration immediately without retry. A semantic change requires scoped review; an earlier whole-plan pass cannot authorize the new body. |

| Scenario | Expected result |
| --- | --- |
| Standalone first invocation after `ReviewedChange=REVIEWED` | Run read-only PLAN, display the complete plan/body, ask and stop; no writes before its own matching confirmation. |
| A main entry supplies a complete confirmed execution checklist covering all delivery operations | Prepare/validate exact PLAN internally, compare scope and derived facts, then EXECUTE in the same user turn without another approval. |
| Initial checklist covers only implementation or lacks the delivery operation | Do not infer authorization; prepare the missing scope and obtain only its required confirmation. |
| User confirms the exact unchanged displayed SubmissionPlan in a later message | Run `submission_phase=EXECUTE` and reuse that one submission authorization. |
| `NO_WIKI` with valid reviewed change | Merge to the confirmed actual test branch (`dev` or `develop`), resolve optional deployment, then perform applicable TAPD registration; never load Wiki capability. |
| User requests “发布测试环境后提测” | Select `DEPLOY` with `TRIGGER_ACCEPTED`; require the exact accepted queue and confirmed-target ref/SHA/params, then continue Wiki/TAPD without waiting. |
| User requests “直接提测” after inspecting implementation | Reuse existing work and original branches, refresh mutable facts and only invalidated verification/review, display the standalone delivery checklist and confirm once; default STANDARD/DEPLOY, no repeated implementation. |
| User requests “不构建” or “跳过发布”, including “直接提测，不构建” | Select `SKIP`, make no build/deploy/parameter/poll call, record `SKIPPED_BY_INTENT`, and continue direct提测; only missing canonical Wiki Job metadata may be read. |
| User requests “先完成代码，我检查后再提测” | Select IMPLEMENT, show 直接提测：否 and all three delivery choices disabled; stop at REVIEWED without submission PLAN, commit/push/MR, Wiki, Jenkins or test registration. |
| Developer edits content after REVIEWED and then requests delivery | Check only affected validation and independent POST_CHANGE_REVIEW; do not treat human inspection or stale review as current evidence. Block failed/unrelated changes before delivery writes. |
| Manual Bug edits invalidate the prior completion record | Review the corrected complete body with current code; include its exact append/reuse action in the one delivery confirmation. Write/reuse and read back the record before any delivery write, then refresh ReviewedChange; no reactivation or retroactive start comment. |
| Bug record refresh fails or its readback is incomplete | Keep actual code/review/comment effects, block all Git/build/Wiki/registration writes, and resume only after reading the existing comment; never blindly append again. |
| The source SHA already equals or is an ancestor of the current test target, with no open MR | Return read-only VERIFIED/VERIFY_CONTAINMENT_ONLY, no MR creation or merge claim; bind the verified target revision for remaining delivery. |
| Merge is disabled but target already contains the reviewed source | Use CONTAINMENT_ONLY and continue with its zero-write containment receipt. |
| Merge is disabled and containment is missing, unknown or stale | Block remaining delivery; never create/merge an MR or deploy an unverified revision. |
| Registration PLAN returns a supported TAPD list wrapper after fixing decoding | Complete fresh read-only preview, with no mutation replay and no repeated implementation review. |
| Plain “提测” without explicit disabled choices | `AUTO` selects `DEPLOY` and `STANDARD`; show merge/build/Wiki and the Wiki preview before confirmation. Explicit `SKIP`/`NO_WIKI` remain authoritative. |
| Trigger fails, receipt is missing/unknown, or pre-trigger source ref/SHA drifts | Return `BLOCKED`; keep current Bug status and perform no later Wiki/status/version writes; never retry a trigger. |
| Exact queue accepted but remains queued/building | Return BUILD_SUBMITTED with the verified jobUrl as the user-facing link and retain queueId/queueUrl plus submitted params internally; continue Wiki/TAPD without polling or claiming deployment/publication success. |
| User reports that the displayed queue URL is unavailable after a build was submitted | Correct the displayed link to the original receipt's verified jobUrl; reuse BUILD_SUBMITTED and perform no new trigger, queue/build/log read or invented build URL. |
| A selected predecessor already deployed its exact current test source, or published the exact available package | Verify current Git/source, Job/environment/channel/parameters and actual availability, retain its original DEPLOYED/RELEASED receipt, and do not trigger it again; consumer rows still need their own gates. |
| An old successful receipt has drifted source, parameters, environment or actual package contents | Reopen affected checks/planning; no success reuse or automatic retry of UNKNOWN. An explicit repeat request remains its own accurately authorized operation. |
| `STANDARD` without a supplied Wiki URL | Inspect TAPD links and Wiki hierarchy; never stop to request a Wiki target. |
| TAPD contains an existing Wiki link | Reuse/update/read back that child and never create a duplicate. |
| No link but one related child exists | Reuse it based on TAPD/branch evidence. |
| Month exists but no related child | Create `MM-DD: 中文简述` under that month with `# 前端`, sequence `1`, and the resolved type-specific status. |
| Month does not exist | Create/read the `YYYY-MM` month under root `1150372234001008260`, then derive/create/read the child under the same consolidated authorization. |
| Planned payload writes entry body to the month page | Block before write; canonical content belongs only in the child Wiki. |
| Existing child has front-end entries | Calculate maximum canonical sequence plus one without asking the user for the sequence. |
| Jenkins Job name or URL is unresolved | Block the Wiki draft; never use a repository name, alias, or guessed URL. |
| The submitted tooling/library project has a verified canary release | Write/read back `当前版本：canary`; omit `是否上线`. |
| The submitted tooling/library project has a verified official release | Write/read back `当前版本：latest`; omit `是否上线`. |
| Tooling submission accepted without actual publication | Preserve an evidenced current channel or use 当前版本：待发布; never treat queue acceptance as canary publication. |
| The submitted project is a business project | Write/read back `是否上线：未合并`; do not claim master merge before it is verified. |
| Final child ID is generated by the authorized plan for a Bug, Story, or Task | The validated Wiki helper derives, writes and reads back the exact comment in the same invocation; do not invoke `linking-tapd-wiki` again or request another confirmation. |
| Same final Wiki ID is already present in the work-item comments | Record `ALREADY_LINKED`; do not duplicate the comment. |
| A different 提测 Wiki link is already present | Block before comment/status/version writes; never append a conflicting second link. |
| Source or confirmed test-target SHA changes before a Git write | Stop the stale write and verify/refresh the exact plan. Evidence-derived technical updates within the main checklist can reuse authority; unreviewed source or changed target/scope requires review and missing authorization. |
| Private validation fails | Execute no current or later operation; return `BLOCKED`. |
| Merge succeeds but confirmed test-target containment fails | Return `BLOCKED`; perform no Wiki/TAPD/version write. |
| Wiki readback fails | Return `BLOCKED`; do not write comment, status, or version. |
| Status succeeds but version fails | Return `BLOCKED` with truthful status success and version failure. |
| External outcome is unknown | Return `BLOCKED`; do not retry or infer success. |
| Bug enters `待测试` with a tester | Write status and `current_owner=te` in the same update and verify both with the applicable version. |
| Bug enters `待测试` without a tester | Use `reporter` as `current_owner`; missing both blocks before writing. |
| Assignment fields change after preview | Block the stale update and refresh the exact plan; compare personnel to approved scope, obtaining fresh authority for a real personnel change. |
| Owner readback mismatches | Report actual status/owner/version effects and block without retry or rollback. |
| Continue Bug is already `待测试` | Complete Git/deployment/Wiki increment but skip status, owner and duplicate test-version writes. |
| `CONTINUE` change is proven non-functional under `STANDARD`, with a verified historical owner page/current entry | Record `SKIPPED_BY_POLICY`, retain exact target/body readback, omit Wiki and Wiki-comment writes, and continue the remaining authorized submission steps. |
| Non-functional `CONTINUE` has no historical page/current entry | Require the normal validated creation/append draft before the submission plan; do not return a skip missing go-live's target. |
| `CONTINUE` change affects functionality under `STANDARD` | Update the existing Wiki entry's `影响范围` with only the new affected scope. |
| Functional supplementation with an existing same-ID comment | Execute one helper invocation; report `wikiState=UPDATED` and `commentState=ALREADY_LINKED` without another comment. |
| Existing Wiki ID, parent, title or original body differs from the confirmed plan | Block before write; never select a same-title replacement or overwrite another editor's changes. |
| Wiki body changes while initial reads/comment pagination run | Recheck exact Wiki ID/body immediately before update; stop before overwriting. |
| Plan is confirmed in a later month | Create under the fixed planned month/title, not the execution date. |
| Existing link appears only in TAPD details or belongs to an earlier month | Reuse that exact Wiki; no month/title rediscovery. |
| MCP comments omit count and an older link is on page two | Continue full pages until a short page and find the existing link. |
| Wiki update succeeds but a conflicting comment appears | Report the actual completed Wiki update and block without writing a conflicting comment or later status/version. |
| Same body and same-ID comment already equal the approved final result | Return a read-only completed result; do not duplicate writes. |
| Normal plan generates commit, MR, Wiki, queue, and build IDs | Treat them as deterministic readbacks; keep one consolidated submission confirmation. |
| Unchanged complete Git delivery plan | Validate the bundle once; commit/push readbacks and exact MR/CI/merge checks do not start separate Agent reviewers. |
| CI remains in the same running state | The merge executor backs off; submission Jenkins returns on queue acceptance with no polling and no extra trigger. |
| Source or target changes while CI is running | Stop before merge with the real new facts; do not restart broad preparation or silently accept new commits. |
| The target merge SHA differs from the original source tip | Use the intended delivered target revision for Jenkins; source-tip ancestry is not actual checkout identity. |
| Another build of the same Job succeeds | It cannot replace this submission's exact queue receipt or prove this deployment/publication. |
| Job lacks actual checkout evidence at submission time | Accept the exact queue receipt after pre-trigger ref/SHA verification; report checkout/deployment unverified and never claim successful release. |
| Initial Bug final registration | One update contains the exact waiting-test state and test-version field, followed by one combined readback. |
| Workflow/custom-field definitions changed after registration preview | Block before update; verify the real new mapping instead of reusing old field/status codes. |
| Status changes but version is not read back | Report the actual status write and unverified version, stop and never roll back/retry. |
| Story/Task registration | Apply only an explicitly applicable version policy; no Bug waiting-test status. |
| Own A → B (`dev` or `develop`) MR conflicts and the main checklist covers automatic ACB | Calculate exact C/path and validate the scoped plan internally, resolve on C, test/review and deliver C → the same B without another question; no unapproved deletion. |
| Standalone own A → B conflict has no ACB authorization | Show its exact ACB plan and wait for confirmation, retaining the existing standalone cleanup preview. |
| Approved template is filled with reviewed implementation, actual verification and generated IDs | Validate exact body/parameters and preserve unrelated entries; consume execution-list authority without a final-template confirmation. |
| A later operation adds a project, changes delivery target/channel or expands Wiki business scope | Pause affected writes, display the change and complete current checklist and obtain missing authority; preserve completed actions. |
| C → dev/develop is verified merged and its temporary resources are safe/idle | Consume the upfront conditional cleanup authority without another prompt or a master-delivery prerequisite; verify actual deletion and retain association/outcomes for go-live. |
| User says 保留中间分支 or 不清理 before confirmation or later | Record RETAIN_BY_USER for the exact affected local/remote C/worktree scope; perform no deletion and carry that override through later go-live. |
| Old ACB confirmation did not include deletion, or C MR remains open/CI fails | No default deletion; obtain only missing exact cleanup authority when needed, or wait for actual merged/containment proof. |
| C is current, dirty, occupied, protected, or needed by a build/another MR | Retain/defer with reason; do not force-delete, stop unrelated tasks or silently discard data. Recheck deferred scope at its next normal completion point under unchanged authority. |

No scenario creates runtime, recovery, audit-ledger, or generated evidence
files.

## Shared Wiki delivery

| Scenario | Expected result |
| --- | --- |
| One Story/Bug has several projects/branches | One sharedWikiPlan and page, all included Git/deployment gates before its one body write, then per-item links/registration. |
| First child Task creates the Wiki | Create one page using the parent Story title, write/read back owner anchor before current Task link. |
| Second child Task or another Bug project submits later | Reuse exact linked page, append current repository/branch entry with fresh body/hash, and link the same ID. |
| Separate read-only project previews both proposed creation, first project has now delivered | Old second CREATE_CHILD plan blocks; refresh REUSE_EXISTING instead of changing title and creating another page. |
| Shared same-name branches in different repositories | Exact entryRepoUrl plus original branch selects only the current project; duplicate pair still blocks. |
| Owner anchor readback fails after page creation | Report actual page creation and failing phase; no current Task comment or later registration and no retry. |
| Confirmed Task changes parent Story before execute | Expected owner binding blocks all writes. |
| Repeated complete submission | No new page, no duplicate owner/current Task comments and no unrelated entry changes. |

| Confirmed target is `dev`; repository also has `develop` | Keep `dev` in the plan, MR, containment, Jenkins ref/SHA and result; never reinterpret it as `develop`. |
| Standalone submission has both `dev` and `develop` with no authoritative selection | Prepare read-only evidence, report the target gap and perform no delivery write until the exact target is confirmed. |
| One Bug spans two required repositories; one review or Git/deployment gate is missing | Return `BLOCKED` with completed effects; no shared Wiki or final TAPD registration until both rows pass. |
| Multi-repository Bug inputs arrive in different orders | Pair by canonical repository/root, origin and fixed branch; reject unmatched or duplicate rows rather than joining by index. |
