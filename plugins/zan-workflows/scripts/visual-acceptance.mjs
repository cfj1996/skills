import { repositoryKey } from './workflow-runtime.mjs';

const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const testId = /^P[1-9]\d*-M[1-9]\d*-F[1-9]\d*-TC[1-9]\d*$/;
const oneLine = value => typeof value === 'string' && value.trim() && !/[\r\n\u2028\u2029]/u.test(value);
export const visualResults = { PASS: '通过', FAIL: '有差异', UNVERIFIED: '待补验' };

export function isEvidenceReference(value) {
  if (!oneLine(value)) return false;
  const reference = value.trim();
  if (/^(?:sandbox:)?\/[^/]/.test(reference)) return true;
  try {
    const url = new URL(reference);
    return ['https:', 'http:', 'codex:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normalizeVisualAcceptance(receipt) {
  if (!receipt || !fingerprint(receipt.approvalFingerprint) || !commit(receipt.sourceSha) ||
      !fingerprint(receipt.contentFingerprint) || !isEvidenceReference(receipt.reviewEvidence) ||
      !Array.isArray(receipt.checks) || !receipt.checks.length) {
    throw new Error('视觉验收回执需绑定确认版、已审源码及内容指纹、独立评审依据和逐条 TC');
  }
  const seen = new Set();
  const checks = receipt.checks.map(check => {
    if (!check || typeof check.testId !== 'string' || !testId.test(check.testId) || seen.has(check.testId) ||
        !Object.hasOwn(visualResults, check.result) || !oneLine(check.observation) ||
        ((check.result === 'PASS' || check.evidence !== undefined) && !isEvidenceReference(check.evidence))) {
      throw new Error('视觉验收 TC 需唯一，并填写结论与实际观察。通过项须附截图或录屏引用');
    }
    seen.add(check.testId);
    const { testId: id, result, observation, evidence } = check;
    return { testId: id, result, observation, ...(evidence === undefined ? {} : { evidence }) };
  });
  const { approvalFingerprint, sourceSha, contentFingerprint, reviewEvidence } = receipt;
  return { approvalFingerprint, sourceSha, contentFingerprint, reviewEvidence, checks };
}

function visualError(message) {
  return Object.assign(new Error(message), { code: 'VISUAL_ACCEPTANCE_REQUIRED' });
}

export function checkVisualDelivery(plan, projects, input, sourceRepository, sourceSha) {
  const projectIds = new Set(projects.map(project => project.id));
  const selected = new Set(plan.selectedFeatures ?? plan.featureIds);
  const required = (plan.visualTests ?? []).filter(test => projectIds.has(test.projectId) && selected.has(test.featureId));
  if (!required.length) return;

  const safeties = input.mockSafeties ?? (input.mockSafety ? [input.mockSafety] : []);
  const repository = repositoryKey(sourceRepository);
  const matching = Array.isArray(safeties) && safeties.filter(row => row?.sourceRepository && repositoryKey(row.sourceRepository) === repository);
  const safety = matching?.length === 1 ? matching[0] : null;
  if (!commit(safety?.sourceSha) || !fingerprint(safety?.contentFingerprint)) {
    throw visualError('视觉验收缺少本轮仓库的已审源码及内容指纹');
  }
  if (sourceSha && (safety.revisionSha ?? safety.sourceSha) !== sourceSha) {
    throw visualError('视觉验收对应的已审源码与待交付 SHA 不一致');
  }
  const matches = receipt => receipt?.approvalFingerprint === plan.approvalFingerprint &&
    receipt.sourceSha === safety.sourceSha && receipt.contentFingerprint === safety.contentFingerprint;

  const results = new Map();
  if (input.visualAcceptance !== undefined) {
    const receipt = normalizeVisualAcceptance(input.visualAcceptance);
    if (!matches(receipt)) throw visualError('视觉验收回执与当前执行计划或代码版本不一致');
    for (const result of receipt.checks) results.set(result.testId, result);
  }
  // The durable record carries the latest readback for this exact review scope.
  for (const { visualAcceptance: receipt } of plan.executionRecord?.progress ?? []) {
    if (!matches(receipt)) continue;
    for (const result of normalizeVisualAcceptance(receipt).checks) results.set(result.testId, result);
  }
  const pending = required.filter(test => results.get(test.testId)?.result !== 'PASS');
  if (pending.length) throw visualError('视觉验收待补验：' + pending.map(test => test.testId).join('、'));
}
