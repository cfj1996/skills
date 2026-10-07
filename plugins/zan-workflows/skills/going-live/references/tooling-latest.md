# Tooling latest delivery

Use this flow when the current go-live scope includes a changed tooling package
or an affected project's dependency on that package. A tooling category alone
does not establish a publishable package. Resolve exact packages, owner repos,
Jenkins release paths, and affected consuming projects through project knowledge
and the submitted changes. Upgrade only consumers involved in this delivery,
not every historical consumer listed in knowledge.

## Plan and order

Include one `ToolingLatestPlan` in the complete go-live checklist:

- Exact package names, owner submissions/original branches, verified default
  targets, source SHAs, registry, and the read-only latest precheck with
  `VERIFIED_EXISTING|NEEDS_RELEASE|BLOCKED` evidence. Only `NEEDS_RELEASE`
  includes Jenkins Job/parameters, exact release ref/source SHA,
  `releaseKind=package`, `releaseChannel=official` (Wiki label `latest`),
  stable version or verified pipeline-computed version rule, and purpose.
- Exact consuming repo/workspace paths and their approved original branches,
  dependency fields, package-manager/lockfile paths, current declarations and
  resolved versions, read-only consumer precheck `CURRENT|OUTDATED|TARGET_PENDING|BLOCKED`,
  required verification commands, review and Git delivery.
- Exact retained Wiki IDs and unique original-branch entries; the minimal
  `当前版本：canary` to `当前版本：latest` patch and resulting body, or an
  unchanged `当前版本：latest` readback. `NO_WIKI` omits Wiki operations.

One displayed confirmation may cover unchanged owner merges, Jenkins releases,
consumer upgrades/commit/push/MRs, and Wiki patches. Bind computed dependency
versions to the actual `publishedPackages` and same-registry `latest` readbacks;
bind each release source to its verified owner merge revision, and consumer
delivery SHAs to the scoped reviewed dependency delta's derived commits.
These are derived values, not permission to add packages/projects. Scope,
refs, release semantics or Wiki-body changes need a fresh actual preview.
Do not require a second confirmation merely because a stage changes.

Before any build or dependency write, complete both read-only checks in order:
package latest first, then every affected consumer's dependency version. Only
then calculate the action decision below and display the complete plan. A
package `NEEDS_RELEASE` result alone must not trigger Jenkins immediately.
Execute the decided actions in
dependency order: merge the package owner when needed, recheck the bound latest
evidence, reuse verified latest or publish only when required, upgrade and
review its consumers, deliver their updated original
branches, then finalize the corresponding Wiki entries. Repeat this ordering
for a package that consumes another changed package. Cyclic or unresolved
ownership/dependency facts block planning rather than guessing an order.
An owner merge must be verified before publishing from its default ref; a
consumer must use the verified latest package before its final master merge.

Every owner/consumer merge supports the manual handoff in `going-live`.
On `AWAITING_MERGE`, retain its exact MR/read-only continuation and completed
effects; pause dependent actions and show `等待有权限人员合并`. An owner
awaiting merge prevents its required publication and dependent upgrades/delivery.
A consumer awaiting merge prevents final Wiki/latest completion and cleanup.
After `已合并，继续上线`, verify that exact MR with `VERIFY_ONLY`, then run
only unfinished authorized stages. Do not repeat a successful publication or
merge; refresh registry/ref/Wiki facts at the remaining boundaries.
Do not merge consumers first and claim the old merge includes a later upgrade.

## Check latest before building

1. Read every required package's `latest` dist-tag from its verified registry,
   using the project's configured registry and read-only package metadata
   capability (for example `npm view '<package>@latest' version --json`).
   Use scoped registry configuration where applicable; never query a different
   public registry or print registry credentials. Read the exact version's
   publication/source evidence from package metadata or an evidenced successful
   official Jenkins release; reuse complete current handoffs without scanning
   unrelated build history.
2. Classify the result before invoking any release executor:
   - `VERIFIED_EXISTING`: latest is a published stable version and its source
     covers this delivery's package change (verified SHA or evidenced equivalent
     package contents). Record `REUSED_LATEST` and its version/source/registry
     evidence; perform no Jenkins trigger or package release. Continue to the
     read-only consumer precheck before deciding whether any upgrade is needed.
   - `NEEDS_RELEASE`: a successful registry read proves latest is absent, or
     verifiable publication/source evidence proves the current latest predates
     this delivery's package change. This permits a release decision only after
     the consumer precheck; do not start a build yet.
   - `BLOCKED`: authentication/network failure, unreadable metadata, conflicting
     version/source evidence, or unknown publication provenance. Missing proof
     is not proof of absence; do not trigger a build to resolve uncertainty.
   A Wiki `latest` label or the existence of any stable tag alone is insufficient.
3. Complete the consumer precheck and action decision below before displaying
   the visible plan. Refresh only the mutable registry
   tag/source facts at the release boundary after owner delivery. A changed
   release decision needs an updated actual preview; never silently turn a
   confirmed reuse into a build. Do not repeat full discovery when it is unchanged.

## Check consumers before deciding actions

After the package check, read every bound project's manifest, exact lockfile
importer and resolved dependency versions on its approved original branch.
Use the lockfile/package-manager resolution and available installed graph;
do not install, edit dependencies or trigger builds during this precheck.
Retain repo/branch/HEAD and manifest/lockfile identity with each result.

- `CURRENT`: the manifest targets/allows the verified package latest and the
  concrete affected resolution equals that stable version, with no canary or
  conflicting workspace resolution. A range alone is insufficient.
- `OUTDATED`: verified package latest exists, but the project's declaration or
  concrete resolution differs from that latest version (including canary or an
  older version). Record the exact delta.
- `TARGET_PENDING`: the package check proved a new release is needed, so the
  final latest version is not yet available. Still read and retain all current
  consumer versions now; bind a comparison to the actual publication result.
  Never upgrade to the old latest or invent the future numeric version.
- `BLOCKED`: required consumer facts are missing, ambiguous or conflicting.
  This does not prove that an upgrade is needed; resolve the read-only blocker
  before starting any release or dependency write.

Only after both checks, choose the actions:

| Package check | Consumer checks | Action decision |
| --- | --- | --- |
| `VERIFIED_EXISTING` | All `CURRENT` | `REUSE_ONLY`: no Jenkins build or dependency upgrade; continue any required Git/Wiki delivery and verification. |
| `VERIFIED_EXISTING` | One or more `OUTDATED`, others `CURRENT` | `UPGRADE_ONLY`: reuse latest and upgrade only outdated projects; no Jenkins release. |
| `NEEDS_RELEASE` | All current versions captured as `TARGET_PENDING` | `RELEASE_THEN_RECHECK`: authorize the required release, then compare consumers to its actual latest version and upgrade only mismatches. |
| Either check blocked | Any | `BLOCKED`: no build or dependency write. |

An evidenced empty consumer set needs no project upgrade. Preserve the exact
decision and its two prechecks in the in-memory plan/result. Refresh changed
facts at their write boundaries; a changed action scope needs a fresh preview.

## Publish only when needed

Run this section only after both prechecks, the `RELEASE_THEN_RECHECK` decision,
and its exact release authorization:

1. Use `running-release` and its Jenkins executor with the official plan.
   Local publish/release scripts and dist-tag promotion are forbidden.
   A whole-project monorepo pipeline needs an explicitly confirmed package
   list/scope; do not widen a single-package request silently.
2. Require `RELEASED`, `releaseChannel=official`, verified source SHA and exact
   queue/build evidence. Read actual stable versions from the publication
   result; a source SHA or `SUCCESS` alone is not a package version.
3. Read each required package's same-registry latest again and require it to
   equal the just-published stable version. Record `PUBLISHED_LATEST` and the
   package/version/source/build/registry evidence. Never retrigger an unknown or
   failed release automatically.

## Upgrade and verify consumers

For each bound consuming project/workspace:

1. Reuse its read-only consumer precheck, refreshing only changed facts at the
   write boundary. For `RELEASE_THEN_RECHECK`, compare the captured declaration
   and resolution to the actual newly published latest before deciding which
   projects need edits. A range that admits the stable version does not prove the
   project has upgraded; the lockfile may still resolve canary or an older version.
2. If all dependency layers already resolve the verified latest version,
   record `ALREADY_CURRENT` with evidence and perform no dependency write.
   Otherwise update only the planned dependency fields and lockfile with the
   project's own package manager. Preserve its established exact-version or
   stable-range convention and bind the resolved version to the verified
   numeric latest version. No stale canary tag/version, local workspace link,
   or newer unrelated dependency substitutes for that registry version.
3. Verify the manifest targets/allows that stable version, the exact affected
   lockfile importer resolves it, and the installed/package-manager-resolved
   dependency graph for that workspace reports the same version. A manifest
   edit, broad install log, or another workspace's version is insufficient.
   Missing/conflicting evidence blocks; do not manufacture a current-version claim.
4. Run the consuming project's required build/test/type/lint checks for this
   upgrade. Review the dependency delta using `implementing-work`'s existing
   read-only change-reviewer with `POST_CHANGE_REVIEW`; refresh the reviewed
   change/source SHA. Prior review of the canary dependency does not cover it.
5. Commit/push only that reviewed scoped delta and use the existing
   `merge-reviewed-branch.mjs` executor for the approved original branch to
   verified default target. Apply ordinary Git/MR/CI/confirmation gates; do
   not implement directly on master or reuse a stale submitted/source SHA.
   Read back the delivered manifest and lockfile at the verified default tip
   and prove containment of the upgraded revision.

## Wiki and completion

After latest is verified by reuse or required release, and consumer upgrades,
reviews and master deliveries
pass, refresh each package's registry `latest` and compare it to the delivered
consumer resolution. A tag that moved means the project is no longer proven
current; stop for an updated version plan instead of silently declaring success.

For `STANDARD`, update only the retained tooling entry's `当前版本：canary`
to `当前版本：latest`, preserving all other bytes. Use the existing update-only
Wiki helper with exact ID/parent/title, fresh original body SHA-256, authorized
full resulting body, and `--mode update --execute`. Require its exact-body
readback and one `当前版本：latest` line with no `是否上线` field. If already
latest, verify the unchanged field against release/upgrade evidence. Business
entries retain their normal `是否上线：已合并` rule. Missing, duplicate or
legacy status fields block this delivery; no old-template migration is allowed.

`ToolingLatestResult` is in memory: `VERIFIED|NOT_APPLICABLE|AWAITING_MERGE|BLOCKED`, package
package/consumer prechecks, action decision, and
`REUSED_LATEST|PUBLISHED_LATEST` release/registry evidence,
each consumer's `UPGRADED|ALREADY_CURRENT` result,
review/checks/delivered revisions, and Wiki update/readbacks or `SKIPPED_NO_WIKI`.
`VERIFIED` requires every package and bound consumer plus the applicable Wiki
checks to pass. An empty consumer list requires explicit evidence that this
delivery has no consuming project; it is not inferred from an incomplete search.
No Wiki profile ever skips release or consumer checks.

On failure, stop later writes and report already completed merges/releases,
unprocessed consumers, and Wiki state separately. Preserve local closeout
results from every completed master merge; suppress cleanup until the whole
required latest flow succeeds. No retry, rollback or persistent ledger is added.
