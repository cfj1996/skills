# Repository Guidelines

## Project Structure & Module Organization

This repository stores reusable agent skills and installable Codex plugins. Keep standalone skills under [`skills/`](/Users/cfj/projects/skills/skills), complete plugins under [`plugins/`](/Users/cfj/projects/skills/plugins), and the remote marketplace manifest at [`.agents/plugins/marketplace.json`](/Users/cfj/projects/skills/.agents/plugins/marketplace.json). Inside a skill package, keep the entry point in `SKILL.md`, role prompts in `agents/*.md`, and supporting guidance in `references/*.md`. Treat `docs/` as generated working output and prefer the owning workflow's current conventions over older artifact examples.

## Build, Test, and Development Commands

There is no global build step in this repository. Use targeted commands instead:

```bash
npx --package=@zan/tapd-cli@canary zan-tapd-cli <bug|story> <id> --json
git log --oneline -5 -- skills/tapd-workflow
git status --short
node --test plugins/zan-workflows/tests/*.test.mjs
python3 -m unittest discover -s plugins/zan-workflows/tests -p 'test_*.py'
node --test plugins/zan-workflows/skills/writing-plans/tests/*.test.mjs
node --test plugins/zan-workflows/skills/merge-request-review/tests/*.test.mjs
python3 /Users/cfj/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/zan-workflows/skills/writing-plans
python3 /Users/cfj/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/zan-workflows
```

The `npx` command fetches TAPD data for workflow execution. Run Git commands from this repository root; use a pathspec such as `-- skills/tapd-workflow` when history should be limited to one standalone skill. The remaining commands run the Zan plugin's complete Node test suite and official Skill/Plugin validators. For a focused Wiki creation/supplementation/comment helper check, run `node --test plugins/zan-workflows/tests/ensure-test-wiki.test.mjs`; the complete Node suite already includes it. This test uses simulated TAPD responses and performs no external writes. For merge/Jenkins executor checks, run `node --test plugins/zan-workflows/tests/delivery-helpers.test.mjs`; these tests also use simulated remote responses. For TAPD registration and read-only closeout checks, run `node --test plugins/zan-workflows/tests/registration-closeout.test.mjs`; these tests simulate both TAPD and Git, without updating real items or deleting resources. For MCP session reuse, Jenkins adapters, automatic TAPD mappings and occupancy collectors, run `node --test plugins/zan-workflows/tests/adaptive-delivery.test.mjs`; remote responses are simulated and SQLite tests use disposable fixture databases. For long session input and GitLab approval compatibility, run `node --test plugins/zan-workflows/tests/session-approval-compat.test.mjs` and `python3 -m unittest discover -s plugins/zan-workflows/tests -p 'test_session_input_pty.py'`; the latter checks a real local PTY without remote writes. For TAPD list decoding, read-only preview recovery and exact Jenkins Job URL lookup, run `node --test plugins/zan-workflows/tests/submission-preflight.test.mjs`; these tests simulate responses without external writes. For browser checks, run `node plugins/zan-workflows/skills/writing-plans/tests/preview-review-panel.mjs`, then open the printed URL for the interactive module preview, add `?assert` for browser regression checks or `?wake&assert` for notification races.

The registration checks also cover waiting-test owner selection (`te` before
`reporter`), assignment drift and partial owner readback, without real TAPD writes.

For default direct submission, the implementation-only developer-inspection stop,
manual-edit review refresh and standalone delivery confirmation, run
`python3 -m unittest discover -s plugins/zan-workflows/tests -p 'test_direct_submission_flow.py'`.
These checks inspect workflow contracts without external writes.

For already-delivered test-target containment, disabled-merge read-only delivery,
stale/missing evidence and workflow-session continuation, run
`node --test plugins/zan-workflows/tests/test-merge-containment.test.mjs`.
It uses simulated APIs and disposable local Git repositories/bare remotes,
without company remote calls or MR writes. The direct-submission Python checks
also cover Bug completion-record refresh before delivery.

For the mounted review panel's public API authorization and destroyed-session
isolation, run `node --test plugins/zan-workflows/skills/writing-plans/tests/review-panel-public-api.test.mjs`.
The full Writing Plans suite includes these tests. For the trusted-click browser
path, open the preview with `?confirm&assert` and click its confirmation button;
it uses a simulated save receipt and does not write a Plan.

For shared Story/Bug Wiki ownership, sibling Task discovery, cross-repository
same-name branches, body-less append previews and idempotent links, run
`node --test plugins/zan-workflows/tests/shared-test-wiki.test.mjs`. These tests
simulate TAPD and workflow sessions with no external writes.

For manual merge permission handoff and read-only continuation checks, run
`node --test plugins/zan-workflows/tests/manual-merge.test.mjs`. These tests
simulate GitLab and workflow sessions, including actionable contact reminders,
exact MR/target links, and go-live versus dev-delivery continuation prompts,
with no external writes.

For Git safety Hook deletion classification and retained creation/rebase gates,
run `node --test plugins/zan-workflows/tests/git-branch-safety.test.mjs`. These
tests evaluate the Hook without executing deletion commands and use one
disposable local Git fixture for `git -C` branch lookup.

For requirement task estimates, confirmation fingerprints, exact Task readbacks,
and Plan-to-Task ownership/coverage checks, run
`node --test plugins/zan-workflows/tests/task-breakdown.test.mjs`. These tests
use in-memory task/field/member fixtures and perform no external writes.
They also verify that execution briefs cannot bypass formal
Plan Task readiness, owner readbacks or step bindings. The Python suite covers
implementation-only Bug routing and conditional submission preparation.
The same task-breakdown suite covers scope/reuse/increment evidence, independent
estimate-review freshness, shared-cost deduplication, read-only estimate previews,
retained historical hours and metadata-only updates. Review receipts and source
facts are simulated; no real Task or review is created by these tests.

For the approved pending-merge Wiki patch, shared-page entry isolation,
permission handoff, readback failure and workflow-session write barriers, run
`node --test plugins/zan-workflows/tests/pending-merge-wiki.test.mjs`.
These tests simulate GitLab and TAPD without external writes.

For local test-merge branch cleanup and exact remote deletion commands, run
`node --test plugins/zan-workflows/tests/cleanup-branches.test.mjs`. These tests
use disposable local repositories and a local bare remote to verify worktree
protection, dev-target `-d` checks without persisted tracking, exact-ref deletion,
and rejection when the remote SHA changes. They never contact a company remote.
They also cover --no-follow-tags with push.followTags enabled and existing
upstream normalization/readback before ordinary temporary-branch deletion.
`registration-closeout.test.mjs` also covers temporary test-merge branches checked
against their own dev/develop targets, including branches without a worktree.

For Bug repair-state and repair-owner planning/readback checks, run
`node --test plugins/zan-workflows/tests/bug-repair-owner.test.mjs`. These tests
use in-memory Bug/member fixtures and the read-only helper CLI; they perform no
TAPD writes.

For existing-branch ancestry and continuation checks, run
`node --test plugins/zan-workflows/tests/branch-ref-relationship.test.mjs`.
These tests use disposable local Git fixtures to cover equal, local-ahead,
remote-ahead, diverged and incomplete-history refs, with no external calls.

For submission completion policy across legacy rules, release guidance,
validators and new/reused tooling Wiki entries, run
`python3 -m unittest discover -s plugins/zan-workflows/tests -p 'test_submission_completion_policy.py'`.
These checks read local instructions only; build-receipt and no-poll behavior
is covered by `delivery-helpers.test.mjs`, `adaptive-delivery.test.mjs` and
`registration-closeout.test.mjs`, using simulated Jenkins/TAPD responses.

For bounded local lint/type/test/build execution, run
`node plugins/zan-workflows/scripts/run-local-check.mjs --kind test -- node --test plugins/zan-workflows/tests/local-verification.test.mjs`.
These tests use small disposable local processes to cover deadlines, aggregate
process-group memory, cancellation, bounded output, output-channel failure and descendant cleanup.
They perform no external calls or writes. The complete Node suite includes them.
The helper's scope and budgets are documented in
`plugins/zan-workflows/references/local-verification.md`.

For commit Hook/Node/local commitlint readiness without Git writes or dependency
downloads, run `node --test plugins/zan-workflows/tests/commit-readiness.test.mjs`.
For short-lived worker shutdown, persistent descendants and cancellation during
shutdown, use `node --test plugins/zan-workflows/tests/local-verification.test.mjs`.
The complete Node suite includes both; fixtures use disposable local repositories/processes.

For workflow-session request timing, deadlines, UNKNOWN-write isolation, explicit
finish/idle shutdown and verified owned MCP/local process cleanup, run
`node --test plugins/zan-workflows/tests/workflow-session-lifecycle.test.mjs`.
It uses local fake MCP processes and simulated responses, without company API calls.

For actual-change scope/impact/documentation merge gates, revision freshness,
same-page continuation corrections and shared Wiki entry preservation, run
`node --test plugins/zan-workflows/tests/change-consistency.test.mjs plugins/zan-workflows/tests/shared-test-wiki.test.mjs`.
These checks use in-memory evidence and simulated TAPD responses, with no external writes.

For external dependency phases, legacy Plan/Session migration, local Mock approval,
shared-record rendering and snapshot freshness, run
`node --test plugins/zan-workflows/skills/writing-plans/tests/external-data-state.test.mjs`.
For Mock inventory/source binding, explicit test authorization, production exclusion and
Jenkins pre-deploy gates, run
`node --test plugins/zan-workflows/tests/mock-safety.test.mjs`.
These tests use disposable local Git fixtures and simulated remote responses; they do
not call company APIs, deploy, publish or modify real TAPD items. The complete Node suites
include them. Team MR tests also cover the same mandatory Mock gate without a Zan exemption.
For project-owned source/artifact checks and release-entry integration without a
Jenkins XML requirement, run
`node --test plugins/zan-workflows/tests/project-mock-gate.test.mjs plugins/zan-workflows/tests/project-mock-check.test.mjs plugins/zan-workflows/tests/mock-source-boundaries.test.mjs`.
These checks execute copied project scripts against disposable Git snapshots and
final staging trees, reject stale script/configuration/review evidence, stop a
simulated publication on check failure, and verify exact build-bound receipts.
`ensure-test-wiki.test.mjs` covers standalone CLI receipt
arguments through real local source inspection and simulated TAPD writes.

## Coding Style & Naming Conventions

For frozen Jenkins parameter preparation and deployments that never query live
parameter definitions, run
`node --test plugins/zan-workflows/tests/frozen-jenkins-contracts.test.mjs plugins/zan-workflows/tests/delivery-helpers.test.mjs plugins/zan-workflows/tests/adaptive-delivery.test.mjs plugins/zan-workflows/tests/mock-safety.test.mjs`.
These fixtures cover fixed environment/profile selectors, explicit defaults,
registry/value drift, sensitive injection and Job/project identity without real
Jenkins writes. The independent collector and its tests belong to project-knowledge;
deployment tests must not call the maintenance sync or a live parameter endpoint.

Write skill docs in concise Markdown with clear `#`/`##` headings, short rule lists, and fenced command examples. Preserve the existing mix of English headings and Chinese workflow detail where the skill already uses it. Name new skill folders with lowercase kebab-case, keep the entry file exactly `SKILL.md`, and use descriptive agent filenames such as `collector.md` or `reviewer.md`.

## Testing Guidelines

The `zan-workflows` plugin includes the Writing Plans skill's Node tests under `plugins/zan-workflows/skills/writing-plans/tests/`; run the complete suite and both official validators for every plugin change. For a standalone skill, run its owning workflow's targeted command, validate `skills/<skill-name>` with `skill-creator/scripts/quick_validate.py`, inspect generated artifacts when applicable, and confirm documented paths and commands still match the repository layout. Keep new scripts and tests inside their owning skill or plugin directory and document the exact command here.

Also run `skills/merge-request-review/tests/*.test.mjs` within the plugin. These
tests cover the renamed CLI without central configuration, ordinary and Zan
review modes, evidence-backed monorepo adoption scope, applicable documentation and revision-bound merge gates using
local fixtures; no project allowlist, TAPD data or remote writes are required.

## Commit & Pull Request Guidelines

Before creating any new working branch, apply the workspace Git naming rule:
`<feature|fixbug>/<author>.<MMDD>.<TAPD-short-ID>.<Chinese-description>` when a
real TAPD item is associated, or `<feature|fixbug>/<author>.<MMDD>.<Chinese-description>`
otherwise. Repository maintenance and tooling use the same author/date/Chinese
description requirements; omit only the ID segment and never invent an ID.
Read the applicable `git-safety.md`, resolve the author from `USER_NAME`, Git
`user.name`, then the OS username, and validate the full name before creation.
Continue on an existing branch without renaming it to satisfy the new rule.

Recent history in `tapd-workflow` uses short conventional-style subjects such as `docs: ...` and `refactor: ...`. Follow that pattern, for example `docs: clarify worktree cleanup` or `feat: add reviewer guidance`. PRs should describe the affected skill, summarize behavior changes, link the TAPD item or issue when applicable, and include example output or screenshots whenever prompts, generated docs, or review artifacts change.

## Security & Configuration Tips

Do not commit TAPD tokens or generated case data with sensitive details. Keep transient workflow output under ignored `docs/` paths unless the change is intentionally documenting a reusable example.

For local execution feedback, secret redaction, ZIP export, fixed-project submission,
repeat submission and unknown-write recovery checks, run
`node --test plugins/zan-workflows/tests/execution-feedback.test.mjs`.
These tests use disposable local data and simulated GitLab MCP responses; they never
upload real files, create real Issues, read chat history or call company APIs.
