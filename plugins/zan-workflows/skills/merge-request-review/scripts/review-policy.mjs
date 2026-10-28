import { fileURLToPath } from 'node:url';
import { evaluateChangeConsistency } from '../../../scripts/change-consistency.mjs';
import { checkMockSafetySet } from '../../../scripts/mock-safety.mjs';

const DOCUMENT_STATES = new Set(['missing', 'present', 'valid', 'invalid', 'unreadable', 'unknown']);
const ADOPTION_SCOPES = new Set(['applicable', 'not-applicable', 'unknown']);

function assertDocumentState(name, value) {
  if (!DOCUMENT_STATES.has(value)) {
    throw new Error(`${name} must be one of: ${[...DOCUMENT_STATES].join(', ')}`);
  }
}

export function classifyAdoption({
  agentDocument = 'unknown',
  adoptionDocument = 'unknown',
  adoptionDeclared = null,
  adoptionScope = 'applicable',
  scopeEvidence = [],
} = {}) {
  assertDocumentState('agentDocument', agentDocument);
  assertDocumentState('adoptionDocument', adoptionDocument);
  if (!ADOPTION_SCOPES.has(adoptionScope)) {
    throw new Error(`adoptionScope must be one of: ${[...ADOPTION_SCOPES].join(', ')}`);
  }

  // Scope is independent of physical file presence and declaration validity.
  // An exclusion needs evidence; unknown scope must not inherit a root adoption.
  if (adoptionScope !== 'applicable') {
    const excluded = adoptionScope === 'not-applicable'
      && Array.isArray(scopeEvidence) && scopeEvidence.length > 0
      && scopeEvidence.every(item => typeof item === 'string' && item.trim().length > 0);
    return {
      reviewMode: excluded ? 'ordinary' : 'ordinary-with-zan-warning',
      zanStatus: excluded ? 'not-adopted' : 'unknown',
      codeReviewContinues: true,
      zanMatrixRequired: false,
      governanceBlocksMerge: !excluded,
    };
  }

  if (agentDocument === 'present'
    && adoptionDocument === 'valid'
    && adoptionDeclared === true) {
    return {
      reviewMode: 'zan-enhanced',
      zanStatus: 'adopted',
      codeReviewContinues: true,
      zanMatrixRequired: true,
      governanceBlocksMerge: false,
    };
  }

  const unreadable = [agentDocument, adoptionDocument].some((state) =>
    ['unreadable', 'unknown'].includes(state),
  );
  if (unreadable || (agentDocument === 'present' && adoptionDeclared === null)) {
    return {
      reviewMode: 'ordinary-with-zan-warning',
      zanStatus: 'unknown',
      codeReviewContinues: true,
      zanMatrixRequired: false,
      governanceBlocksMerge: true,
    };
  }

  const declaredButBroken = adoptionDeclared === true
    || adoptionDocument === 'invalid'
    || (adoptionDocument === 'valid'
      && (agentDocument !== 'present' || adoptionDeclared === false));
  if (declaredButBroken) {
    return {
      reviewMode: 'ordinary-with-zan-warning',
      zanStatus: 'misconfigured',
      codeReviewContinues: true,
      zanMatrixRequired: false,
      governanceBlocksMerge: true,
    };
  }

  if (adoptionDocument === 'missing'
    && adoptionDeclared !== true
    && ['missing', 'present'].includes(agentDocument)) {
    return {
      reviewMode: 'ordinary',
      zanStatus: 'not-adopted',
      codeReviewContinues: true,
      zanMatrixRequired: false,
      governanceBlocksMerge: false,
    };
  }

  return {
    reviewMode: 'ordinary-with-zan-warning',
    zanStatus: 'unknown',
    codeReviewContinues: true,
    zanMatrixRequired: false,
    governanceBlocksMerge: true,
  };
}

async function evaluateReadiness(input, io, operation) {
  const {
  codeReview = 'incomplete',
  safety = 'unknown',
  mergeability = 'unknown',
  mergePermission = 'unknown',
  approvePermission = 'unknown',
  pipeline = 'none',
  pipelineRequired = false,
  unresolvedDiscussions = false,
  approval = 'not-required',
  zanStatus = 'not-adopted',
  zanMust = 'not-applicable',
  changeReview,
  currentChange,
  } = input;
  const blockers = [];
  let mockSafetyError;

  if (codeReview === 'blocker') blockers.push('code');
  else if (codeReview !== 'pass') blockers.push('code-review-incomplete');
  if (safety !== 'pass') blockers.push('safety');
  if (mergeability !== 'mergeable') blockers.push('mergeability');
  // Verified GitLab permission is independent of MR approvals and the human
  // authorization required for an actual write; this helper grants neither.
  if (mergePermission !== 'allowed') blockers.push('merge-permission');
  if (operation === 'approve' && approvePermission !== 'allowed') blockers.push('approve-permission');
  if (pipeline === 'failed') blockers.push('pipeline-failed');
  else if (pipelineRequired === true && pipeline !== 'success') {
    if (pipeline === 'none') blockers.push('pipeline-missing');
    else if (pipeline === 'pending') blockers.push('pipeline-pending');
    else blockers.push('pipeline-not-success');
  }
  else if (!['success', 'none', 'pending'].includes(pipeline)) blockers.push('pipeline-unknown');
  if (typeof pipelineRequired !== 'boolean') blockers.push('pipeline-requirement-unknown');
  if (unresolvedDiscussions !== false) blockers.push('unresolved-discussions');
  // An approval may satisfy a currently unmet requirement; it must not pretend
  // that the MR already meets that requirement or relax the subsequent merge.
  const approvalStates = operation === 'approve'
    ? ['approved', 'not-required', 'required-missing']
    : ['approved', 'not-required'];
  if (!approvalStates.includes(approval)) blockers.push('approval');
  if (!['adopted', 'not-adopted'].includes(zanStatus)) blockers.push('zan-governance');
  if (zanStatus === 'adopted' && zanMust !== 'pass') blockers.push('zan-must');
  blockers.push(...evaluateChangeConsistency(changeReview, currentChange).blockers);

  // This gate is independent of Zan adoption and applies before approval as
  // well as merge. JSON pass flags/old receipts cannot replace a fresh run of
  // the shared source/content checker. currentChange comes from the current
  // verified MR head, target and full diff, not from mockRepositories.
  try {
    if (!currentChange || !/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(currentChange.targetSha || '') ||
        !/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(currentChange.sourceSha || '') ||
        typeof currentChange.sourceRepository !== 'string' || !currentChange.sourceRepository.trim() ||
        !['master', 'main', 'dev', 'develop'].includes(currentChange.targetBranch) ||
        typeof currentChange.purpose !== 'string' || !currentChange.purpose.trim() ||
        !/^[a-f\d]{64}$/i.test(currentChange.scopeFingerprint || '')) {
      throw new Error('Mock 门禁缺少当前 MR 目标、完整差异指纹和准确操作目的');
    }
    const safeties = input.mockSafeties || (input.mockSafety ? [input.mockSafety] : []);
    if (safeties.length !== 1 || safeties[0]?.baseSha !== currentChange.targetSha ||
        safeties[0]?.scopeFingerprint !== currentChange.scopeFingerprint) {
      throw new Error('Mock 清查必须覆盖当前 MR source/target 的完整差异，不能替换目标基准或范围');
    }
    const production = ['master', 'main'].includes(currentChange.targetBranch);
    await checkMockSafetySet(input, {
      operation: 'git-delivery', environmentKind: production ? 'production' : 'test',
      sourceRepository: currentChange.sourceRepository, sourceSha: currentChange.sourceSha,
      targetBranch: currentChange.targetBranch,
      targetEnvironment: production ? 'production' : currentChange.targetEnvironment,
      purpose: currentChange.purpose, requireCommitted: true,
    }, io);
  } catch (error) {
    blockers.push('mock-safety');
    mockSafetyError = error.message;
  }

  return {
    blockers,
    ...(mockSafetyError ? { mockSafetyError } : {}),
  };
}

export async function evaluateMergeReadiness(input = {}, io = {}) {
  const result = await evaluateReadiness(input, io, 'merge');
  return { mergeAllowed: result.blockers.length === 0, ...result };
}

export async function evaluateApprovalReadiness(input = {}, io = {}) {
  const result = await evaluateReadiness(input, io, 'approve');
  return { approvalAllowed: result.blockers.length === 0, ...result };
}

async function runCli() {
  const [command, payload = '{}'] = process.argv.slice(2);
  const input = JSON.parse(payload);
  if (command === 'classify-adoption') {
    process.stdout.write(`${JSON.stringify(classifyAdoption(input), null, 2)}\n`);
    return;
  }
  if (command === 'evaluate-merge') {
    process.stdout.write(`${JSON.stringify(await evaluateMergeReadiness(input), null, 2)}\n`);
    return;
  }
  if (command === 'evaluate-approve') {
    process.stdout.write(`${JSON.stringify(await evaluateApprovalReadiness(input), null, 2)}\n`);
    return;
  }
  throw new Error('usage: review-policy.mjs <classify-adoption|evaluate-merge|evaluate-approve> <json>');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
