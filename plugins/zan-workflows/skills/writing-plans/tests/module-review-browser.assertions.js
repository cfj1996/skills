globalThis.runModuleReviewBrowserAssertions = async function () {
  const failures = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const host = document.querySelector('[data-page-delivery-review-host]');
  const root = host?.shadowRoot;
  const api = globalThis.__PAGE_DELIVERY_REVIEW__;
  const click = selector => root.querySelector(selector)?.click();
  try {
    check(root.querySelectorAll('[data-review-list-item]').length === 3, 'three modules should be shown');
    check(root.querySelectorAll('[data-child-module]').length === 2, 'children should be distinguishable');
    check(root.querySelector('[data-module-technical]')?.open === false, 'technical implementation starts collapsed');
    check(root.textContent.includes('输入') && root.textContent.includes('输出') && root.textContent.includes('验收例子'), 'behavior contract must be rendered');
    click('[data-card-index="2"]');
    check(root.textContent.includes('外部数据与依赖') && root.textContent.includes('EXT-001'), 'external dependency must be visible in its related module');
    check(root.textContent.includes('需求待确认') && !root.querySelector('[data-module-question]'), 'technical contract gaps must not appear as business confirmation questions');
    const note = root.querySelector('[data-field="userNote"]');
    note.focus(); note.value = '对话补充前的意见'; note.dispatchEvent(new Event('input', { bubbles: true }));
    check(root.activeElement === note && note.isConnected, 'notes preserve focus and the DOM node');
    click('[data-value="已确认"]');
    check(api.getState().cards[2].conclusion === '已确认' && api.getState().cards[2].implementationPlan.status === 'blocked', 'requirement and implementation readiness must be independent');
    const next = structuredClone(globalThis.reviewSession);
    next.sessionId = 'module-browser-update-' + crypto.randomUUID();
    next.cards[1].module.rules.push('对话新增的校验规则');
    next.cards[1].module.revision += 1;
    next.cards[2].sourceEvidence.push({ id: 'E-MOCK-APPROVAL', kind: 'human-confirmation', label: '浏览器fixture中明确批准的Mock范围' });
    next.cards[2].module.revision += 1;
    next.mockModules = [{ id: 'MOCK-BROWSER', marker: 'MOCK_ONLY', status: 'active', mode: 'function-data',
      featureRefs: ['M-003'], taskRefs: [], paths: ['src/login/mock-provider.ts'], scenarios: ['success', 'failure'],
      activation: '开发入口显式开启', realRequestBoundary: '本功能不发送真实保存请求', exitCondition: '接入真实接口并验证',
      verificationLimits: ['未验证真实业务链路'], authorizationEvidenceRefs: ['E-MOCK-APPROVAL'], exitEvidenceRefs: [] }];
    api.updateReviewSession(next);
    check(document.querySelector('[data-page-delivery-review-host]') === host, 'dialogue updates must preserve the host');
    check(api.getState().cards[2].userNote === '对话补充前的意见' && api.getState().cards[2].conclusion === '已确认', 'unrelated notes and decisions survive');
    check(api.getState().cards[1].conclusion === '未评审' && api.getState().cards[1].reopened, 'changed modules reopen');
    check(root.textContent.includes('MOCK_ONLY') && root.textContent.includes('禁止上线'), 'Mock must show an explicit non-production marker');
    const beforeInvalid = api.getState().sessionId;
    try { api.updateReviewSession({ ...next, cards: [] }); } catch {}
    check(api.getState().sessionId === beforeInvalid && api.getState().cards.length === 3, 'invalid updates preserve the current review');
    click('[data-action="submit"]');
    const submission = api.exportSubmission();
    check(submission?.cards.length === 3, 'module submission should be exported');
    check(submission.externalDependencies[0].id === 'EXT-001' && submission.mockModules[0].id === 'MOCK-BROWSER', 'dependency and Mock facts must survive the real browser submission');
    const stored = JSON.parse(localStorage.getItem(`page-delivery-review:v1:${next.deliveryUnitKey}`));
    check(stored.dependencyReview.evidenceRefs.length > 0 && stored.mockModules[0].authorizationEvidenceRefs[0] === 'E-MOCK-APPROVAL', 'browser draft must retain audit and Mock authorization references');
    check(root.textContent.includes('意见已提交，等待 Agent 处理'), 'submission should display a clear receipt');
    check(root.textContent.includes('已提交') && root.textContent.includes('对话'), 'submission explains the manual handoff');
    const result = api.applyResult({ ...submission, results: submission.cards.map(card => ({ id: card.id, cardIds: [card.id], conclusion: '待修改', summary: card.module.purpose, planChangeSummary: card.module.change.summary })) });
    check(result.mode === 'result' && !result.lastError, 'result return should work');
    check(root.textContent.includes('文档未保存'), 'review results must not claim a saved file');
    api.markPlanSaved({ ...submission, savedPlanFingerprint: 'sha256:fake' });
    check(api.getState().saveState === 'unsaved', 'file save receipt requires content confirmation first');
  } catch (error) { failures.push(error.message); }
  return { valid: failures.length === 0, failures };
};
