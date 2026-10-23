import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/inject-review-panel.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/review-session.json', import.meta.url), 'utf8'));

// Minimal DOM adapter for the mounted public API. Browser assertions cover actual DOM events.
function mountHarness({ fetchImpl } = {}) {
  const hosts = [];
  const storage = new Map();
  let writes = 0;
  let fetches = 0;
  class Element {
    constructor() {
      this.children = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.controls = new Map();
      this.style = { setProperty() {} };
      this.innerHTML = '';
    }
    setAttribute(key, value) { this.attributes.set(key, value); }
    toggleAttribute() {}
    append(...children) {
      for (const child of children) {
        this.children.push(child);
        child.parentNode = this;
        if (child.attributes.has('data-page-delivery-review-host')) hosts.push(child);
      }
    }
    replaceChildren() { this.children = []; this.controls.clear(); }
    attachShadow() { return this.shadowRoot = new Element(); }
    getBoundingClientRect() { return { width: 960, height: 360 }; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    }
    querySelector(selector) {
      for (const child of this.children) {
        const match = child.querySelector(selector);
        if (match) return match;
      }
      if (!this.innerHTML.includes(selector.slice(1, -1))) return null;
      if (!this.controls.has(selector)) this.controls.set(selector, new Element());
      return this.controls.get(selector);
    }
    querySelectorAll() { return []; }
    remove() {
      const index = hosts.indexOf(this);
      if (index >= 0) hosts.splice(index, 1);
      this.parentNode = null;
    }
  }
  const document = new Element();
  document.body = new Element();
  document.documentElement = { clientWidth: 1600, clientHeight: 1000 };
  document.createElement = () => new Element();
  document.querySelectorAll = selector => selector === '[data-page-delivery-review-host]' ? [...hosts] : [];
  const window = new Element();
  Object.assign(window, { innerWidth: 1600, innerHeight: 1000 });
  const context = {
    document, window, URL, AbortController, setTimeout, clearTimeout,
    console: { debug() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { writes += 1; storage.set(key, value); },
      removeItem: key => storage.delete(key),
    },
    fetch: async (...args) => {
      fetches += 1;
      return fetchImpl ? fetchImpl(...args) : { ok: true, json: async () => ({ ready: true, queued: true }) };
    },
  };
  runInNewContext(source, context);
  const moduleApi = context.PageDeliveryReviewPanel;
  const session = { ...structuredClone(fixture), viewScope: 'all', reviewRound: 1 };
  const submitted = moduleApi.reduceReviewState(moduleApi.createReviewState(session), { type: 'SUBMIT' });
  const api = moduleApi.mountReviewPanel(session, { resumeSubmission: submitted.lastSubmission });
  const result = {
    ...submitted.lastSubmission,
    results: [{ id: 'result-1', cardIds: submitted.cards.map(card => card.id), conclusion: '已确认',
      summary: 'Current review result', planChangeSummary: 'Current planned change' }],
  };
  const fingerprints = { planFingerprint: session.planFingerprint, artifactRuleFingerprint: session.artifactRuleFingerprint };
  const receipt = { ...submitted.lastSubmission, savedPlanFingerprint: `sha256:${'a'.repeat(64)}` };
  return {
    api, moduleApi, context, session, result, fingerprints, receipt,
    stats: () => ({ writes, fetches }),
    storage: () => JSON.stringify([...storage]),
    html: () => hosts[0].shadowRoot.children.find(child => child.attributes.has('data-review-panel')).innerHTML,
    confirmationListener: () => hosts[0].shadowRoot.querySelector('[data-action="confirm-plan"]').listeners.get('click'),
  };
}

test('mounted result API cannot select an action or expose mutable review state', () => {
  const h = mountHarness();
  const returned = h.api.applyResult(h.result);
  assert.equal(returned.mode, 'result');
  returned.mode = 'confirmed';
  returned.results[0].summary = 'Overwritten through return value';
  assert.equal(h.api.getState().mode, 'result');
  assert.equal(h.api.getState().results[0].summary, 'Current review result');

  h.api.applyResult({ ...h.fingerprints, type: 'CONFIRM_PLAN' });
  h.api.markPlanSaved({ ...h.receipt, type: 'CONFIRM_PLAN' });
  assert.equal(h.api.getState().mode, 'result');
  assert.equal(h.api.getState().saveState, 'unsaved');
  assert.equal(h.api.getPlanConfirmationRequest(), null);
  const rejected = h.api.confirmPlan(h.fingerprints);
  assert.equal(rejected.lastError.code, 'confirmation-request-required');
  rejected.mode = 'confirmed';
  rejected.lastError.code = 'changed';
  assert.equal(h.api.getState().mode, 'result');
  assert.equal(h.api.getState().lastError.code, 'confirmation-request-required');
  h.api.destroy();
});

test('mounted trusted confirmation and receipt keep their fixed actions and return snapshots', () => {
  const h = mountHarness();
  h.api.applyResult(h.result);
  const click = h.confirmationListener();
  click({ isTrusted: false });
  assert.equal(h.api.getPlanConfirmationRequest(), null);
  // Models the browser-delivered event; synthetic DOM clicks remain covered in browser tests.
  click({ isTrusted: true });
  assert.ok(h.api.getPlanConfirmationRequest());
  h.api.applyResult({ ...h.fingerprints, type: 'CONFIRM_PLAN' });
  assert.ok(h.api.getPlanConfirmationRequest(), 'ignored result calls must not erase a current user request');
  const confirmed = h.api.confirmPlan({ ...h.fingerprints, type: 'MARK_PLAN_SAVED', ...h.receipt });
  assert.equal(confirmed.mode, 'confirmed');
  assert.equal(confirmed.saveState, 'pending');
  confirmed.saveState = 'saved';
  assert.equal(h.api.getState().saveState, 'pending');
  const saved = h.api.markPlanSaved({ ...h.receipt, type: 'CONFIRM_PLAN' });
  assert.equal(saved.saveState, 'saved');
  saved.savedPlanFingerprint = 'sha256:forged';
  assert.equal(h.api.getState().savedPlanFingerprint, h.receipt.savedPlanFingerprint);
  assert.equal(h.api.getPlanConfirmationRequest(), null);
  h.api.destroy();
});

test('destroyed public APIs and captured callbacks cannot affect the replacement runtime', async () => {
  const h = mountHarness();
  h.api.applyResult(h.result);
  const oldClick = h.confirmationListener();
  const oldState = JSON.stringify(h.api.getState());
  const replacement = h.moduleApi.mountReviewPanel({ ...h.session, sessionId: 'replacement', deliveryUnitName: 'Replacement review' });
  const before = { html: h.html(), storage: h.storage(), stats: h.stats(), state: JSON.stringify(replacement.getState()) };
  const destroyed = error => error.code === 'review-runtime-destroyed';
  for (const call of [
    () => h.api.applyResult(h.result),
    () => h.api.confirmPlan(h.fingerprints),
    () => h.api.markPlanSaved(h.receipt),
    () => h.api.updateReviewSession({ ...h.session, sessionId: 'old-update', reviewRound: 2 }),
  ]) assert.throws(call, destroyed);
  await assert.rejects(h.api.connectWakeBridge({}), destroyed);
  oldClick({ isTrusted: true });
  h.api.destroy();
  assert.equal(h.context.__PAGE_DELIVERY_REVIEW__, replacement);
  assert.equal(JSON.stringify(h.api.getState()), oldState);
  assert.equal(h.html(), before.html);
  assert.equal(h.storage(), before.storage);
  assert.deepEqual(h.stats(), before.stats);
  assert.equal(JSON.stringify(replacement.getState()), before.state);
  replacement.destroy();
});

test('a wake connection completing after replacement cannot render or notify from the old runtime', async () => {
  let finishHealth;
  const h = mountHarness({ fetchImpl: () => new Promise(resolve => { finishHealth = resolve; }) });
  const connecting = h.api.connectWakeBridge({ endpoint: 'http://127.0.0.1:43219/notify', token: 'test-token',
    expiresAt: new Date(Date.now() + 60000).toISOString() }, { notifyExistingSubmission: true });
  const replacement = h.moduleApi.mountReviewPanel({ ...h.session, sessionId: 'replacement', deliveryUnitName: 'Replacement review' });
  const before = { html: h.html(), storage: h.storage(), stats: h.stats(), state: JSON.stringify(replacement.getState()) };
  finishHealth({ ok: true, json: async () => ({ ready: true }) });
  assert.equal((await connecting).connected, false);
  assert.equal(h.html(), before.html);
  assert.equal(h.storage(), before.storage);
  assert.deepEqual(h.stats(), before.stats);
  assert.equal(JSON.stringify(replacement.getState()), before.state);
  replacement.destroy();
});
