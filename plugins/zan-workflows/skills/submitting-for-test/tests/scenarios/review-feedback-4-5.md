# Forward review for small changes and a closed submission session

Use the current skills. The facts below are fixtures. Inspect them and describe
the actual next operations, order and evidence. Do not open live GitLab, Jenkins,
TAPD or project repos, edit source, or send a write. Treat each case separately.

## A. Small presentation Bug

User request: “按已确认的样式修复销量和金额太近的问题，修完按这份清单提测。”

The repair branch, checklist and test delivery are approved. The reported viewport
is 360 px. The first draft imports `./Metrics` from the affected Vue view and
adds `Metrics.vue` next to existing `metrics.js`. The project's actual
resolver maps this import to the JS helper on the local filesystem. One
browser sample has realistic counts and amounts. More widths use the same
layout rules. There is no separate mandatory full-suite check in this fixture.
The record draft is still private when pre-submission review finds the import.

## B. Single-page requirement and a replaced shared Wiki

User request: “展示设置加一个字段，用现有单配置接口读写。做好后提测。”

The project has a native affected-package check using its existing tsconfig and
Vue plugin. Its full typecheck traverses the monorepo. No full-scope check is
required by the project or needed by the change evidence. The user confirms
two selected Tasks, the exact source branch, test Job and shared Wiki.

Later, the MR merges and its queue is accepted. The Story's latest comment
links the new test Wiki and says “（作废旧页 #20）”. The original plan bound
page 20. Both selected Tasks belong to the same Story. One still has the old
link. A sibling outside the approved range also exists. The original
workflow-session closed while the new Wiki body was being reviewed. The old
queue returns 404. Its exact Job still has a unique matching historical
`queueId` and matching submitted test parameters. The test branch has
advanced while retaining the original delivered commit. Registration is
`NOT_APPLICABLE`. A re-created temporary file contains identical reviewed bytes.

## Evaluator checks

- A resolves the new import in the real app before expanding layout tests.
  Additional checks need distinct acceptance or risk. Refresh the current
  review and draft after fixing the import. Publish one verified repair
  record after delivery gates, including the independent Wiki link if selected.
- B selects the project-native affected check first. At continuation, preserve
  the original Git and accepted queue receipts and use the scoped new-session
  Wiki path. Verify the exact retired and replacement pages, queue ID and all
  selected Task links. Keep the historical link and the other Task outside the
  operation. Same reviewed bytes keep the confirmation binding. No Git, Jenkins
  or registration write is repeated. Unverified or conflicting evidence stops
  the dependent operation.
