import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createWakeNotifier } = require('../scripts/inject-review-panel.js');
const config = () => ({ endpoint: 'http://127.0.0.1:43219/notify', token: 'private-test-token', expiresAt: new Date(Date.now() + 60000).toISOString() });
const submission = { sessionId: 'session-1', submissionId: '45c336bf-1851-4cbd-ab9a-b35f6db44d91', submissionVersion: 1, planFingerprint: 'sha256:' + 'a'.repeat(64), artifactRuleFingerprint: 'sha256:' + 'b'.repeat(64), cards: [{ userNote: 'should-not-be-transmitted' }], message: 'must-not-be-transmitted', threadId: 'arbitrary-target' };

test('wake client handshakes and transmits only submission identity', async () => {
  const requests = [];
  const notifier = createWakeNotifier(config(), async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/health') ? { ready: true } : { queued: true } };
  });
  await notifier.check();
  await notifier.notify('review-submitted', submission);
  assert.equal(requests[0].url, 'http://127.0.0.1:43219/health');
  assert.equal(requests[1].options.credentials, 'omit');
  assert.equal(requests[1].options.referrerPolicy, 'no-referrer');
  const payload = JSON.parse(requests[1].options.body);
  assert.deepEqual(Object.keys(payload).sort(), ['token', 'event', 'sessionId', 'submissionId', 'submissionVersion', 'planFingerprint', 'artifactRuleFingerprint'].sort());
  assert.doesNotMatch(requests[1].options.body, /should-not|must-not|arbitrary-target/);
});

test('wake configuration cannot leak its token to non-loopback or ambiguous targets', () => {
  for (const endpoint of ['https://example.com/notify', 'http://localhost:43219/notify', 'http://127.0.0.1:43219/other', 'http://127.0.0.1:43219/notify?token=wrong', 'http://user:pass@127.0.0.1:43219/notify']) {
    assert.throws(() => createWakeNotifier({ ...config(), endpoint }), /Invalid/);
  }
  assert.throws(() => createWakeNotifier({ ...config(), expiresAt: new Date(0).toISOString() }), /expired/);
});

test('failed or unacknowledged notification never retries or claims success', async () => {
  let calls = 0;
  const notifier = createWakeNotifier(config(), async () => {
    calls += 1;
    return { ok: false, json: async () => ({ error: 'queue-outcome-unknown' }) };
  });
  await assert.rejects(notifier.notify('review-submitted', submission), /queue-outcome-unknown/);
  assert.equal(calls, 1);
  const incomplete = createWakeNotifier(config(), async () => ({ ok: true, json: async () => ({ queued: false }) }));
  await assert.rejects(incomplete.notify('review-submitted', submission), /not queued/);
});


test('runtime upgrades preserve a real exported submission without generating a new one', () => {
  const { createReviewState, reduceReviewState, restoreSubmittedReview } = require('../scripts/inject-review-panel.js');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/module-review-session.json', import.meta.url), 'utf8'));
  const original = reduceReviewState(createReviewState(fixture), { type: 'SUBMIT' });
  const restored = restoreSubmittedReview(createReviewState(fixture), original.lastSubmission);
  assert.equal(restored.mode, 'reviewing');
  assert.equal(restored.lastSubmission.submissionId, original.lastSubmission.submissionId);
  assert.equal(Object.isFrozen(restored.lastSubmission), true);
  assert.throws(() => restoreSubmittedReview(createReviewState(fixture), { ...original.lastSubmission, sessionId: 'other' }), /matching/);
  const changed = structuredClone(original.lastSubmission); changed.cards[0].userNote = 'changed after submission';
  assert.throws(() => restoreSubmittedReview(createReviewState(fixture), changed), /content and opinions/);
});
