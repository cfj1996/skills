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
    const note = root.querySelector('[data-field="userNote"]');
    note.focus(); note.value = '对话补充前的意见'; note.dispatchEvent(new Event('input', { bubbles: true }));
    check(root.activeElement === note && note.isConnected, 'notes preserve focus and the DOM node');
    click('[data-value="已确认"]');
    check(api.getState().cards[2].conclusion === '已确认' && api.getState().cards[2].implementationPlan.status === 'blocked', 'requirement and implementation readiness must be independent');
    const next = structuredClone(globalThis.reviewSession);
    next.sessionId = 'module-browser-update-' + crypto.randomUUID();
    next.cards[1].module.rules.push('对话新增的校验规则');
    next.cards[1].module.revision += 1;
    api.updateReviewSession(next);
    check(document.querySelector('[data-page-delivery-review-host]') === host, 'dialogue updates must preserve the host');
    check(api.getState().cards[2].userNote === '对话补充前的意见' && api.getState().cards[2].conclusion === '已确认', 'unrelated notes and decisions survive');
    check(api.getState().cards[1].conclusion === '未评审' && api.getState().cards[1].reopened, 'changed modules reopen');
    const beforeInvalid = api.getState().sessionId;
    try { api.updateReviewSession({ ...next, cards: [] }); } catch {}
    check(api.getState().sessionId === beforeInvalid && api.getState().cards.length === 3, 'invalid updates preserve the current review');
    click('[data-action="submit"]');
    const submission = api.exportSubmission();
    check(submission?.cards.length === 3, 'module submission should be exported');
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
