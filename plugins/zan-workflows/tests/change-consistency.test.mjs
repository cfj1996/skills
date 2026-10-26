import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChangeConsistency } from '../scripts/change-consistency.mjs';
import { evaluateMergeReadiness } from '../skills/managed-mr-review/scripts/review-policy.mjs';
import { assertWikiEntryUpdate, wikiReviewHash } from '../scripts/wiki-entry.mjs';

const branch = 'feature/alice.1024.权限调整';
const repoA = 'https://git.example.test/team/admin.git';
const repoB = 'https://git.example.test/team/shop.git';
const selector = { sourceBranch: branch, originUrl: repoA };
const entry = (n, repo, content = '列表只展示当前门店数据') => `${n}. Job：[admin](https://ci.example.test/job/admin/)\n- 项目名称：[admin](${repo})\n- 内容：${content}\n- 代码分支名：${branch}\n- 影响范围：\n  1. 列表查询及共用筛选方法\n- 验证结果：门店隔离与空列表验证通过\n- 是否上线：未合并\n`;
const page = `# 前端\n\n${entry(1, repoA)}\n${entry(2, repoB)}\n# 备注\n保留人工备注\n`;
const current = () => ({ sourceSha: 'a'.repeat(40), targetSha: 'b'.repeat(40),
  documentHashes: { 'tapd:50372234:story:100': 'c'.repeat(64),
    'wiki:50372234:400:admin': wikiReviewHash(page, selector) } });
const passed = evidence => ({ status: 'pass', evidence: [evidence] });
const review = () => ({ ...current(), scope: passed('需求 100 限定当前门店；diff 中查询条件与该行为对应'),
  impact: passed('已追踪公共筛选方法的两个调用方；门店隔离及空列表验证通过'),
  documentation: passed('Wiki 400 当前项目条目覆盖列表行为及共用方法影响') });
const merge = (changeReview = review(), currentChange = current()) => evaluateMergeReadiness({
  codeReview: 'pass', safety: 'pass', mergeability: 'mergeable', changeReview, currentChange,
});

test('ordinary code success cannot bypass scope, impact or Wiki omissions', () => {
  assert.equal(merge().mergeAllowed, true);
  for (const key of ['scope', 'impact', 'documentation']) {
    const value = review(); value[key] = { status: 'fail', evidence: ['当前 diff 改变公共默认行为，范围或说明没有覆盖'] };
    assert.deepEqual(merge(value).blockers, [`change-${key}`]);
  }
  const value = review(); value.scope = { status: 'fail', evidence: ['新增权限行为无需求依据'] };
  value.documentation = passed('已补写新增权限行为');
  assert.equal(merge(value).mergeAllowed, false, '补写 Wiki 不能批准额外行为');
});

test('legacy, missing, malformed and unsupported checks fail closed', () => {
  assert.equal(evaluateMergeReadiness({ codeReview: 'pass', safety: 'pass', mergeability: 'mergeable' }).mergeAllowed, false);
  for (const key of ['scope', 'impact', 'documentation']) {
    for (const result of [undefined, null, true, {}, { status: 'pass' }, { status: 'pass', evidence: [] },
      { status: 'pass', evidence: [' '] }, { status: 'approved', evidence: ['说明'] }, { status: 'unknown', evidence: ['不可读'] }]) {
      const value = review(); value[key] = result;
      assert.ok(merge(value).blockers.includes(`change-${key}-unknown`), `${key}: ${JSON.stringify(result)}`);
    }
  }
});

test('explicit document exemptions retain scope and impact checks', () => {
  for (const exemption of ['NO_WIKI', 'NOT_APPLICABLE']) {
    const value = review(), now = current();
    value.documentHashes = {}; now.documentHashes = {};
    value.documentation = { status: 'not-required', exemption, evidence: ['本轮明确免除 Wiki；范围及影响已独立核实'] };
    assert.equal(merge(value, now).mergeAllowed, true);
    value.impact.status = 'unknown';
    assert.ok(merge(value, now).blockers.includes('change-impact-unknown'));
  }
  const value = review(); value.documentation = { status: 'not-required', evidence: ['没有找到 Wiki'] };
  assert.ok(merge(value).blockers.includes('change-documentation-unknown'));
});

test('review binds current source, target and scoped document evidence', () => {
  for (const key of ['sourceSha', 'targetSha']) {
    const now = current(); now[key] = 'd'.repeat(40);
    assert.ok(merge(review(), now).blockers.includes('change-review-stale'));
  }
  for (const hashes of [undefined, null, [], {}, { added: 'e'.repeat(64) },
    { ...current().documentHashes, 'tapd:50372234:story:100': 'f'.repeat(64) }]) {
    assert.ok(merge(review(), { ...current(), documentHashes: hashes }).blockers.includes('change-documentation-stale'));
  }
  assert.equal(evaluateChangeConsistency(null, null).mergeAllowed, false);
  const value = review(); value.documentHashes = {};
  assert.ok(merge(value, { ...current(), documentHashes: {} }).blockers.includes('change-documentation-stale'));
});

test('same-page behavioral correction invalidates coverage; sibling/status updates do not', () => {
  const hash = wikiReviewHash(page, selector);
  const corrected = page.replace('列表只展示当前门店数据', '列表按新权限展示授权门店数据');
  assert.notEqual(wikiReviewHash(corrected, selector), hash);
  const now = current(); now.documentHashes['wiki:50372234:400:admin'] = wikiReviewHash(corrected, selector);
  assert.ok(merge(review(), now).blockers.includes('change-documentation-stale'));
  assert.equal(wikiReviewHash(page.replace(entry(2, repoB), entry(2, repoB, '商城新增筛选')), selector), hash);
  assert.equal(wikiReviewHash(page.replaceAll('是否上线：未合并', '是否上线：待合并'), selector), hash);
  assert.notEqual(wikiReviewHash(page.replace('验证通过', '尚未验证'), selector), hash);
});

test('entry correction preserves other repositories, history and identity', () => {
  const corrected = page.replace('列表只展示当前门店数据', '列表按新权限展示授权门店数据');
  assert.doesNotThrow(() => assertWikiEntryUpdate(page, corrected, selector));
  assert.throws(() => assertWikiEntryUpdate(page, corrected.replace('保留人工备注', '删除旧说明'), selector), /保留其他/);
  assert.throws(() => assertWikiEntryUpdate(page, corrected.replace(entry(2, repoB), entry(2, repoB, '意外变更')), selector), /保留其他/);
  assert.throws(() => assertWikiEntryUpdate(page, corrected.replace(branch, 'feature/another'), selector), /不存在或不唯一/);
  assert.throws(() => wikiReviewHash(`${page}\n${entry(3, repoA)}`, selector), /不存在或不唯一/);
  assert.throws(() => wikiReviewHash(`${page}\n${entry(3, repoA)}`, {
    ...selector, entryHeading: page.split('\n')[2],
  }), /不存在或不唯一/);
  assert.throws(() => wikiReviewHash(page.replace('- 是否上线：未合并', '- 是否上线：未合并\n- 是否上线：已合并'), selector), /重复或冲突/);
  const both = [selector, { sourceBranch: branch, originUrl: repoB }];
  assert.doesNotThrow(() => assertWikiEntryUpdate(page, page.replaceAll('列表只展示当前门店数据', '明确的新行为'), both));
  assert.throws(() => assertWikiEntryUpdate(page, corrected, [selector, selector]), /重复/);
});

test('fenced examples do not impersonate a real entry or hide meaningful content', () => {
  const example = `\n\`\`\`md\n${entry(9, repoA)}\`\`\`\n`;
  assert.equal(wikiReviewHash(page + example, selector), wikiReviewHash(page, selector));
  const withExample = page.replace('- 内容：', `\`\`\`md\n- 是否上线：未合并\n\`\`\`\n- 内容：`);
  assert.notEqual(wikiReviewHash(withExample, selector), wikiReviewHash(withExample.replace('是否上线：未合并', '是否上线：已合并'), selector));
});
