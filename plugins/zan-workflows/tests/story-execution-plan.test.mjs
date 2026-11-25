import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readAcceptanceReview, validatePlan } from '../skills/collecting-requirements/scripts/validate-plan.mjs';
import { visualFeatures, withVisualTests } from './helpers/visual-plan-fixture.mjs';

const skill = new URL('../skills/collecting-requirements/', import.meta.url);
const story = readFileSync(new URL('assets/example-plan.md', skill), 'utf8');
const frontend = readFileSync(new URL('assets/example-frontend-plan.md', skill), 'utf8');
const reportFlow = readFileSync(new URL('assets/example-report-flow.md', skill), 'utf8');
const scope = { workspaceId: '123', storyId: '111230010000101' };
const check = (text, target = scope) => validatePlan(text, target);
const replace = (text, from, to) => {
  assert.ok(text.includes(from), 'Missing test anchor: ' + from);
  return text.replace(from, to);
};
const bug = readFileSync(new URL('assets/example-bug-plan.md', skill), 'utf8');
const bugScope = { workspaceId: scope.workspaceId, bugId: '111230010000102' };

test('visual acceptance binds an approved reference and a concrete case to the same selected feature', () => {
  const layout = withVisualTests(frontend);
  const { visualTests: cases } = check(layout);
  assert.deepEqual(cases.map(row => [row.testId, row.uiId, row.featureId, row.projectId]),
    visualFeatures.map(feature => [feature + '-TC2', feature + '-UI1', feature, 'P1']));
  assert.match(cases[0].reference, /https:\/\/design.example.test\/import.png/);
  assert.match(cases[0].passing, /验证码同行/);
  assert.equal(check(frontend).visualTests, undefined);
  assert.throws(() => check(layout.replace(/^##### P1-M2-F1-TC2[\s\S]*$/m, '')), /P1-M2-F1-UI1 缺少.*视觉对齐 TC/);
  assert.throws(() => check(replace(layout, '**对照界面** P1-M1-F1-UI1', '**对照界面** P1-M2-F1-UI1')), /同一功能/);
  assert.throws(() => check(replace(layout, '[已确认的图一](https://design.example.test/import.png)', '图一')), /可回读的参考链接/);
  assert.throws(() => check(layout.replace(/^- \*\*通过条件\*\*.*$/gm, '')), /通过条件/);
});

test('accepts Story and Bug with exact type and string identity, including long IDs', () => {
  assert.ok(check(story).indexes.includes('P2-M1-F1-TC1'));
  assert.ok(check(bug, bugScope).valid);
  assert.equal(check(bug, bugScope).alignment.status, '全部对齐');
  assert.ok(check(bug.replace('/tapd_fe/123/bug/detail/', '/123/bugtrace/bugs/view/'), bugScope).valid);
  assert.ok(check(story.replace('/tapd_fe/123/story/detail/', '/123/prong/stories/view/')).valid);
  const longId = '1150372234001084391';
  assert.ok(check(story.replaceAll(scope.storyId, longId), { ...scope, storyId: longId }).valid);
  assert.throws(() => check(story, bugScope));
  assert.throws(() => check(bug, scope));
  assert.throws(() => check(bug, { ...scope, ...bugScope }), /只能指定一项/);
  assert.throws(() => check(story, { ...scope, workspaceId: '999' }), /工作项链接/);
  assert.throws(() => check(story.replace('/story/detail/', '/bug/detail/')), /工作项链接/);
  assert.throws(() => check(story.replace('/tapd_fe/', '.example.test/tapd_fe/')), /工作项链接/);
  assert.throws(() => check(story.replace('/detail/' + scope.storyId, '/detail/9')), /工作项链接/);
  assert.throws(() => check(story.replace('需求 ID | ' + scope.storyId, '需求 ID | 9')), /工作项 ID/);
});

test('requires execution status and delivery choices but allows the default delegation option to be omitted', () => {
  for (const label of ['需求链接', '需求 ID', 'TAPD 需求状态', '创建时间', '执行状态', '是否提测', '是否构建']) {
    assert.throws(() => check(story.split('\n').filter(line => !line.startsWith('| ' + label + ' |')).join('\n')), /缺少工作项字段/);
  }
  assert.deepEqual(check(replace(story, '| 是否开启子智能体开发模式 | 否 |\n', '')), check(story));
  assert.ok(check(replace(story, '| 是否开启子智能体开发模式 | 否 |', '| 是否开启子智能体开发模式 | 是 |')).valid);
  assert.throws(() => check(replace(story, '| 是否开启子智能体开发模式 | 否 |', '| 是否开启子智能体开发模式 | 待确定 |')), /须为是或否/);
  assert.throws(() => check(story.replace('| 是否提测 | 否 |', '| 是否提测 | 待确定 |')), /须为是或否/);
  assert.throws(() => check(story.replace('执行状态 | 待执行', '执行状态 | 评审中')), /执行状态无效/);
  assert.throws(() => check(story.replace('| 创建时间 |', '| 开发人员 | 无 |\n| 创建时间 |')), /工作项字段/);
  assert.throws(() => check(story.replace('| 创建时间 |', '| 创建时间 | 另一时间 |\n| 创建时间 |')), /工作项字段/);
});

test('stable unique heading indexes bind each child to the correct level and parent', () => {
  assert.throws(() => check(replace(story, '### P1-D2 区域', '### P1-D1 区域')), /重复索引/);
  assert.throws(() => check(replace(story, '#### P2-M1-F1 选择', '#### P1-M1-F2 选择')), /父级/);
  assert.throws(() => check(replace(story, '##### P2-M1-F1-UI1 打开', '#### P2-M1-F1-UI1 打开')), /层级/);
  assert.throws(() => check(replace(story, '## P1 门店', '## P01 门店')), /索引标题/);
  assert.throws(() => check(replace(story, '##### P2-M1-F1-TC1 核对', '##### P2-M1-F2-TC1 核对')), /父级/);
  assert.throws(() => check(replace(story, '### P1-M1 门店目录', '### P1-M2 空模块\n\n### P1-M1 门店目录')), /缺少功能/);
});

test('resolves typed data and prerequisite references across projects and catches cycles', () => {
  assert.ok(check(story).valid);
  assert.throws(() => check(replace(story, '**数据依赖** P1-D2', '**数据依赖** P2-D1')), /数据依赖引用不存在/);
  assert.throws(() => check(replace(story, '**数据依赖** P1-D2', '**数据依赖** P1-M1-F1')), /类型错误/);
  assert.throws(() => check(replace(story, '**前置功能** P1-M1-F1', '**前置功能** P1-M1-F5')), /前置功能引用不存在/);
  assert.throws(() => check(replace(story, '**前置功能** 无', '**前置功能** P2-M1-F1')), /循环/);
  assert.throws(() => check(replace(story, '**前置功能** 无', '**前置功能** P1-M1-F1')), /循环/);
});

test('alignment follows actual selected consumers, including shared providers and deferred work', () => {
  const { alignment } = check(story);
  assert.equal(alignment.status, '全部对齐');
  assert.deepEqual(alignment.dependencies, [
    { id: 'P1-D1', status: '已对齐', features: ['P1-M1-F1'] },
    { id: 'P1-D2', status: '已对齐', features: ['P1-M1-F1', 'P2-M1-F1'] },
  ]);
  const supplier = story.indexOf('### P1-D2 ');
  const before = story.slice(0, supplier), after = story.slice(supplier);
  const unaligned = before + replace(after, '**对齐** 已对齐', '**对齐** 未对齐');
  assert.throws(() => check(unaligned), /P1.*未全部对齐/);
  assert.throws(() => check(replace(unaligned, '**外部数据对齐** 全部对齐', '**外部数据对齐** 未全部对齐')), /P2.*未全部对齐/);
  assert.equal(check(unaligned.replaceAll('**外部数据对齐** 全部对齐', '**外部数据对齐** 未全部对齐')).alignment.status, '未全部对齐');
  const unknown = before + replace(after, '**对齐** 已对齐', '**对齐** 待核实');
  assert.ok(check(unknown.replaceAll('**外部数据对齐** 全部对齐', '**外部数据对齐** 待核实')).valid);
  assert.ok(check(story.replaceAll('**对齐** 已对齐', '**对齐** 不适用')
    .replaceAll('**外部数据对齐** 全部对齐', '**外部数据对齐** 本轮无适用项')).valid);
  const p2 = story.indexOf('## P2 ');
  const deferred = story.slice(0, p2) + replace(story.slice(p2), '**本轮** 纳入', '**本轮** 后续');
  assert.throws(() => check(deferred), /P2.*本轮无适用项/);
  const outOfScope = deferred.slice(0, p2) + replace(deferred.slice(p2), '**外部数据对齐** 全部对齐', '**外部数据对齐** 本轮无适用项');
  assert.ok(check(outOfScope).valid);
  const unreviewed = outOfScope.slice(0, p2) + replace(outOfScope.slice(p2), '**依赖审查** 已核对', '**依赖审查** 待核实');
  assert.throws(() => check(unreviewed), /P2.*待核实/);
  assert.ok(check(replace(unreviewed, '**外部数据对齐** 本轮无适用项', '**外部数据对齐** 待核实')).valid);
});

test('frontend plan resolves reused, incomplete and Mock API rows without a provider project', () => {
  const { featureProjects, featureIds, alignment } = check(frontend);
  assert.deepEqual(featureProjects.map(project => project.id), ['P1']);
  assert.deepEqual(featureIds, ['P1-M1-F1', 'P1-M1-F2', 'P1-M2-F1']);
  assert.deepEqual(alignment.dependencies, [
    { id: 'P1-D1', status: '已对齐', features: ['P1-M1-F1'] },
    { id: 'P1-D2', status: '未对齐', features: ['P1-M1-F1', 'P1-M1-F2'] },
    { id: 'P1-D3', status: '待核实', features: ['P1-M2-F1'] },
  ]);
  assert.equal(alignment.status, '未全部对齐');
  const escaped = replace(frontend, '`storeId/visible`', '`storeId \\| visible`').replaceAll('\n', '\r\n');
  assert.deepEqual(check(escaped), check(frontend));
});

test('acceptance-first paths preserve navigation order, repeated UI visits and selection boundaries', () => {
  const { featureIds } = check(reportFlow);
  const full = readAcceptanceReview(reportFlow, scope, featureIds);
  const [journey] = full.paths;
  assert.deepEqual(full.standaloneTestIds, ['P1-M2-F1-TC1']);
  assert.equal(journey.testId, 'P1-M1-F1-TC1');
  assert.deepEqual(journey.featureIds, ['P1-M1-F1', 'P1-M2-F1']);
  assert.deepEqual(journey.steps.map(step => step.uiId), [
    'P1-M1-F1-UI1', 'P1-M1-F1-UI2', 'P1-M1-F1-UI2', 'P1-M2-F1-UI1', 'P1-M1-F1-UI2',
  ]);
  assert.match(journey.precondition, /1440×900/);
  assert.match(journey.reference, /Zan/);
  assert.match(journey.steps[2].expected, /viewAgencyId=101/);
  assert.deepEqual(journey.outsideSelection, []);
  const report = readAcceptanceReview(reportFlow, scope, ['P1-M1-F1']);
  assert.deepEqual(report.paths[0].outsideSelection, ['P1-M2-F1']);
  assert.deepEqual(report.standaloneTestIds, []);
  const downloads = readAcceptanceReview(reportFlow, scope, ['P1-M2-F1']);
  assert.deepEqual(downloads.paths[0].outsideSelection, ['P1-M1-F1']);
  assert.deepEqual(downloads.standaloneTestIds, ['P1-M2-F1-TC1']);
});

test('optional path checking rejects broken interaction references, missing bases and empty outcomes', () => {
  const badTarget = replace(reportFlow, '| P1-M2-F1-UI1 |', '| P1-M2-F1-TC1 |');
  assert.ok(check(badTarget).valid); // Historical prose remains readable without this projection.
  assert.throws(() => readAcceptanceReview(badTarget, scope), /第 4 步的交互引用/);
  assert.throws(() => readAcceptanceReview(replace(badTarget, '| P1-M2-F1-TC1 |', '| P9-M1-F1-UI1 |'), scope), /引用不存在/);
  assert.throws(() => readAcceptanceReview(replace(reportFlow, '**对照依据**', '**其他说明**'), scope), /对照依据/);
  const blank = reportFlow.replace(/(\| P1-M1-F1-UI1 \|[^|\n]+\|)[^|\n]+\|/, '$1 |');
  assert.notEqual(blank, reportFlow);
  assert.throws(() => readAcceptanceReview(blank, scope), /填齐各列/);
  assert.throws(() => readAcceptanceReview(frontend, scope), /需要在 TC 中填写跨页步骤/);
  const escaped = replace(reportFlow, '以本周打开服务商报表', '以 `本周 \\| 自定义` 打开报表').replaceAll('\n', '\r\n');
  assert.equal(readAcceptanceReview(escaped, scope).paths[0].steps.length, 5);
});

test('the same interface can be referenced from two projects and is registered once', () => {
  const legacyStart = story.indexOf('### P1-D2 ');
  const legacyEnd = story.indexOf('### P1-M1 ');
  const table = [
    '### 接口清单', '',
    '| 编号 | 接口 | 前端传 / 读 | 对齐 | 就绪与验证 | 本轮接入及缺口 | 依据 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| P1-D2 | 门店目录 · 查门店 · `GET /api/stores` | `regionId` 与门店候选 | 已对齐 | 待联调 | 联验候选 | 正式契约 |',
    '', '',
  ].join('\n');
  const shared = story.slice(0, legacyStart) + table + story.slice(legacyEnd);
  assert.deepEqual(check(shared), check(story));

  const second = table.replace('P1-D2', 'P2-D1').replace('查门店', '门店下拉');
  const duplicate = replace(shared, '### P2-M1 活动编辑', second + '### P2-M1 活动编辑');
  assert.throws(() => check(duplicate), /P2-D1 重复登记接口，请引用 P1-D2/);
});

test('API tables reject malformed, dangling and mis-scoped rows', () => {
  assert.throws(() => check(replace(frontend, '| P1-D3 |', '| P2-D3 |')), /须属于当前项目/);
  assert.throws(() => check(replace(frontend, '| P1-D3 |', '| P1-D2 |')), /重复索引/);
  assert.throws(() => check(replace(frontend, '### P1-M1 门店列表', '### P1-D2 同一编号\n\n### P1-M1 门店列表')), /重复索引/);
  assert.throws(() => check(replace(frontend, '**数据依赖** P1-D3', '**数据依赖** P1-D4')), /数据依赖引用不存在/);
  assert.throws(() => check(replace(frontend, '**数据依赖** P1-D3', '**数据依赖** 无')), /P1-D3 须由消费功能引用/);
  assert.throws(() => check(replace(frontend, '| 待核实 | 本地可验。', '| 已对齐 | 本地可验。')), /未确认的方法与路径/);
  assert.throws(() => check(replace(frontend, '| 依据 |', '| |')), /表头无效/);
  assert.throws(() => check(replace(frontend, '### P1-M2 展示配置', '### 接口清单\n\n### P1-M2 展示配置')), /在业务模块之前且只出现一次/);
});

test('requires scoped implementation, repository rules and observable test/UI bodies', () => {
  for (const field of ['项目规范', '契约', '就绪及验证', '输入与输出', '修改位置', '实施步骤']) {
    assert.throws(() => check(replace(story, '**' + field + '**', '**遗漏**')), new RegExp(field));
  }
  assert.throws(() => check(story.replace(/^\s*1\. .*$/m, '')), /有序实施步骤/);
  const noTc = story.slice(0, story.indexOf('##### P2-M1-F1-TC1 核对')) + '## 执行记录\n';
  assert.throws(() => check(noTc), /P2-M1-F1.*缺少对应 TC/);
  const emptyUi = story.replace(/(##### P2-M1-F1-UI1[^\n]*)[\s\S]*?(##### P2-M1-F1-TC1)/, '$1\n\n$2');
  assert.throws(() => check(emptyUi), /UI1 缺少交互/);
});

test('fenced examples with fake fields and indexes never alter the plan structure', () => {
  const example = ['~~~~md', '## 执行记录', '### P1-D1 重号', '~~~', '| 执行状态 | 开发中 |',
    '- **数据依赖** P999-D1', '~~~~'].join('\n');
  const withCode = replace(story, '### P1-D2 ', example + '\n\n### P1-D2 ');
  assert.deepEqual(check(withCode.replaceAll('\n', '\r\n')), check(story));
  assert.throws(() => check(replace(story, '- **前置功能** 无', '```md\n- **前置功能** 无\n```')), /前置功能/);
  assert.throws(() => check(replace(story, '- **数据依赖** P1-D2', '- **数据依赖** P1-D3\n```\n### P1-D3 示例\n```')), /引用不存在/);
});

test('the last managed progress section binds real receipts to the current execution status', () => {
  assert.throws(() => check(story.replace('## 执行记录', '')), /执行记录/);
  assert.throws(() => check(story + '\n## P3 新范围'), /最后一节/);
  const first = '- [p2.start] 领取 P2-M1-F1｜依据 开工确认 101｜执行状态 开发中\n';
  const started = replace(story, '执行状态 | 待执行', '执行状态 | 开发中') + first;
  assert.ok(check(started).valid);
  assert.throws(() => check(started + first), /回执编号重复/);
  assert.throws(() => check(story + first), /顶部执行状态/);
  assert.throws(() => check(started.replaceAll('开发中', '已上线')), /状态顺序/);
  assert.throws(() => check(story + '- [p2.start] 没有来源\n'), /依据/);
});

test('local CLI reads one JSON object on stdin and exits nonzero for the wrong target', () => {
  const cli = fileURLToPath(new URL('scripts/validate-plan.mjs', skill));
  const run = target => spawnSync(process.execPath, [cli], { input: JSON.stringify({ markdown: story, ...target }), encoding: 'utf8' });
  const passed = run(scope), failed = run(bugScope);
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).valid, true);
  assert.notEqual(failed.status, 0);
  assert.ok(failed.stderr.trim());
});

test('a formal plan binds project, module and Bug-specific evidence to executable features', () => {
  const emptyProject = story.slice(story.indexOf('## P2 '), story.indexOf('### P2-M1 ')).replace('## P2 ', '## P3 ');
  assert.throws(() => check(story.replace('## 执行记录', emptyProject + '## 执行记录')), /P3 缺少模块/);
  for (const key of ['实施范围', '职责与依赖']) {
    assert.throws(() => check(replace(story, '**' + key + '**', '**遗漏**')), new RegExp(key));
  }
  assert.throws(() => check(replace(bug, '**复现与实际结果**', '**遗漏**'), bugScope), /复现与实际结果/);
  assert.throws(() => check(replace(bug, '**回归验收** P1-M1-F1-TC1', '**回归验收** 无'), bugScope), /回归验收/);
});
