import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { sessionInput } from '../scripts/session-input.mjs';
import { approvalEvidence, createGitlabApprovalReader } from '../scripts/gitlab-approvals.mjs';

function fakeTty(raw = false) {
  const input = new PassThrough(), modes = [];
  input.isTTY = true; input.isRaw = raw;
  input.setRawMode = value => { modes.push(value); input.isRaw = value; };
  return { input, modes };
}

test('pipe input stays unmodified and raw TTY mode restores exactly once', () => {
  const pipe = new PassThrough();
  const ordinary = sessionInput(pipe); assert.equal(ordinary.stream, pipe); assert.equal(ordinary.mode, 'pipe');
  ordinary.restore();
  for (const initiallyRaw of [false, true]) {
    const fake = fakeTty(initiallyRaw), transport = sessionInput(fake.input);
    assert.equal(transport.mode, 'raw-tty'); assert.equal(fake.input.isRaw, true);
    transport.restore(); transport.restore();
    assert.deepEqual(fake.modes, [true, initiallyRaw]);
    assert.equal(fake.input.listenerCount('data'), 0);
  }
});

test('long UTF-8 input is forwarded byte-for-byte across arbitrary chunk boundaries', async () => {
  const fake = fakeTty(), transport = sessionInput(fake.input), chunks = [];
  transport.stream.on('data', value => chunks.push(value));
  const body = Buffer.from(JSON.stringify({ note: '中文素材上传'.repeat(5000) }) + '\n');
  for (let start = 0; start < body.length; start += 7) fake.input.emit('data', body.subarray(start, start + 7));
  assert.deepEqual(Buffer.concat(chunks), body);
  transport.restore();
});

test('Ctrl-C interrupts once and Ctrl-D ends the stream without corrupting its prefix', async () => {
  const fake = fakeTty(); let interrupts = 0;
  const transport = sessionInput(fake.input, () => { interrupts++; });
  fake.input.emit('data', Buffer.from([3])); fake.input.emit('data', Buffer.from([3]));
  assert.equal(interrupts, 1); transport.restore();
  const other = fakeTty(), eof = sessionInput(other.input), chunks = [];
  eof.stream.on('data', value => chunks.push(value));
  other.input.emit('data', Buffer.from('complete\n\x04ignored'));
  await new Promise(resolve => eof.stream.once('end', resolve));
  assert.equal(Buffer.concat(chunks).toString(), 'complete\n'); eof.restore();
});

test('approval counts never interpret null, blank or boolean values as zero', () => {
  for (const value of [null, '', false, -1, 1.5, 'unknown']) {
    assert.throws(() => approvalEvidence({ rules: [{ approvals_required: value, approved: true }] }), /数量/);
    assert.throws(() => approvalEvidence({ approvals_required: value, approvals_left: 0 }), /不完整/);
  }
  assert.deepEqual(approvalEvidence({ approvals_required: '2', approvals_left: '0', approved: true }),
    { state: 'COUNTS_VERIFIED', required: 2, remaining: 0 });
  assert.throws(() => approvalEvidence({ approved: true }), /不可验证/);
});

test('approval API reads are GET-only, same-instance and restricted to metadata/exact MR', async () => {
  const requests = [];
  const reader = createGitlabApprovalReader({ GITLAB_API_URL: 'https://git.example.test/api/v4', GITLAB_PERSONAL_ACCESS_TOKEN: '' },
    { projectId: 1, originUrl: 'git@git.example.test:team/demo.git' }, async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => url.endsWith('/metadata')
        ? { enterprise: false, version: '17.10.0' } : { approved: false, approved_by: [] } };
    });
  assert.deepEqual(await reader.metadata(), { enterprise: false, version: '17.10.0' });
  await reader.approvals(7);
  assert.deepEqual(requests.map(row => row.url), ['https://git.example.test/api/v4/metadata',
    'https://git.example.test/api/v4/projects/1/merge_requests/7/approvals']);
  assert.ok(requests.every(row => row.options.method === 'GET' && row.options.redirect === 'error'));
  await assert.rejects(reader.approvals('../other'), /IID/);
  assert.throws(() => createGitlabApprovalReader({ GITLAB_API_URL: 'https://other.example.test/api/v4' },
    { projectId: 1, originUrl: 'git@git.example.test:team/demo.git' }), /实例/);
});

test('read-only API permission/JSON/edition failures are not converted to Community mode', async () => {
  const env = { GITLAB_API_URL: 'https://git.example.test/api/v4', GITLAB_PERSONAL_ACCESS_TOKEN: '' };
  const input = { projectId: 1, originUrl: 'git@git.example.test:team/demo.git' };
  for (const response of [
    { ok: false, status: 403 },
    { ok: true, json: async () => { throw new Error('invalid'); } },
    { ok: true, json: async () => ({ version: '17.10.0' }) },
  ]) {
    await assert.rejects(createGitlabApprovalReader(env, input, async () => response).metadata());
  }
});
