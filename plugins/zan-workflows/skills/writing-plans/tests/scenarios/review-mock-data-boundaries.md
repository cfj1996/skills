# Read-only Mock implementation scenarios

All projects, paths, package behavior and approvals below are simulated fixtures.
Use the current `references/mock-development.md`, `developing-requirement`,
`writing-plans` and `implementing-work` instructions. For each case, return the
implementation boundary, data/configuration changes, needed product-page changes,
scenario scope, later removal steps and verification limits. Use only these facts and the plugin's
instructions; do not access company APIs, write files, run services, create branches
or imply that any implementation or verification has occurred.

## A. Connected Query Contract consumer

User request:

> 开发商品列表和编辑页，先走 Mock。本轮只做本地开发验证。

Verified fixture facts:

- Business rules, normal list/edit acceptance and local Mock scope are approved.
- Existing branch: `feature/dev.1030.商品管理`; continue in its verified workspace.
- The application already has Query definitions, confirmed contracts, metadata,
  generated Mock artifacts, a stateful handler and a working development proxy.
  Current requests demonstrably reach the matching handler through `X-Query-ID`.
- Pages already consume Query results and use the shared mutation invalidation path.
  The selected handler currently supplies one normal product; editing must update
  both the list and detail response. Development configuration chooses the data source.
- Product requirements contain no environment label, Mock panel or fault-test request.

## B. Query installed without a working Mock binding

User request:

> 这个项目有 Query，会员列表先用本地数据，接口以后接。

Verified fixture facts:

- Local feature-data Mock and normal list behavior are approved on the original branch.
- Query and QueryAdapter are installed and used by the page. Their verified public
  executor accepts a replaceable feature-data provider without changing page callers.
- Query Contract is also installed, but no artifact, handler, Mock server or routing
  is configured. Existing HTTP requests currently go to the real service.
- Business model and fields are known; formal method, URL and transport schema are not.
- The user did not request tooling installation or a full Query Contract integration.

## C. No Query and no existing Mock infrastructure

User request:

> 老项目的积分明细先用 Mock 完成正常查询，暂不接接口。

Verified fixture facts:

- Scope and local-only Mock are approved. No Query or Mock library is installed.
- The existing page consumes `pointsService.list()`; its data source can be selected
  at the existing development configuration boundary. No public API change is needed.
- Normal filtering and pagination are specified. No exception/fault requirement exists.
- Another module has unrelated real requests which are outside the selection.

## D. No Query but an existing HTTP Mock

User request:

> 沿用项目已有 Mock，补这个订单列表的数据。

Verified fixture facts:

- The project has a configured HTTP handler and approved formal list contract.
- Its existing service/method/path matcher, fixture file and development startup
  configuration work. Query is absent. Local Mock scope covers only this list request.
- Product requirements ask only for normal list rendering and filtering.

## E. Explicit fault request

User request:

> 默认还是正常数据，额外验证一次保存超时后可重试。通过开发配置切换，
> 业务页面保持原样，不要加调试按钮。

Verified fixture facts:

- Existing Query Contract Mock is connected, and the verified handler supports a
  development-configuration-selected timeout response for the save operation.
- The approved acceptance requires preserving edits, clearing loading and allowing
  retry. No other failure cases, page redesign or external delivery are requested.

## F. Business states and natural empty results

User request:

> 按 PRD 做整改列表，先走 Mock，不额外做异常模拟。

Verified fixture facts:

- PRD explicitly includes pending/rejected entries and resubmission after rejection.
- Normal filters may match no entries; the page has its ordinary empty-state component.
- Query, a feature-data provider, validation and loading/error handling already exist.
- The existing fixed branch is `feature/dev.1028.整改Mock`; continuation is authorized.
- No network-failure fixture or page Mock indicator is required by the product.

## G. Review a proposed Mock boundary

User request:

> 先评审实施方案，Mock 不要体现在业务层，要低耦合、以后快拆分。

Verified fixture facts:

- Existing page callers use `goodsData.list(filter)` and `goodsData.save(input)`.
  Query contracts and normal business response shapes are confirmed.
- A proposal keeps the visual layout unchanged but adds `mockMode` to both methods,
  forwards the value through page components and business hooks, imports a fixture
  from the business store, and adds `isMock` to returned goods data.
- The project already has a development-only data-source assembly module capable
  of selecting independent real/Mock data implementations with the original methods.
- User approval covers normal local Mock behavior and read-only review only. The
  user has not requested a separate environment UI or changed business parameters.

Assess the proposal and describe how the eventual transition to real data should work.
