import { fileURLToPath } from 'node:url';

const DOCUMENT_STATES = new Set(['missing', 'present', 'valid', 'invalid', 'unreadable', 'unknown']);

function assertDocumentState(name, value) {
  if (!DOCUMENT_STATES.has(value)) {
    throw new Error(`${name} must be one of: ${[...DOCUMENT_STATES].join(', ')}`);
  }
}

export function classifyAdoption({
  agentDocument = 'unknown',
  adoptionDocument = 'unknown',
  adoptionDeclared = null,
} = {}) {
  assertDocumentState('agentDocument', agentDocument);
  assertDocumentState('adoptionDocument', adoptionDocument);

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

export function evaluateMergeReadiness({
  codeReview = 'incomplete',
  safety = 'unknown',
  mergeability = 'unknown',
  pipeline = 'none',
  pipelineRequired = false,
  unresolvedDiscussions = false,
  approval = 'not-required',
  zanStatus = 'not-adopted',
  zanMust = 'not-applicable',
} = {}) {
  const blockers = [];

  if (codeReview === 'blocker') blockers.push('code');
  if (codeReview === 'incomplete') blockers.push('code-review-incomplete');
  if (safety !== 'pass') blockers.push('safety');
  if (mergeability !== 'mergeable') blockers.push('mergeability');
  if (pipeline === 'failed') blockers.push('pipeline-failed');
  if (pipelineRequired && pipeline === 'none') blockers.push('pipeline-missing');
  if (pipelineRequired && pipeline === 'pending') blockers.push('pipeline-pending');
  if (unresolvedDiscussions) blockers.push('unresolved-discussions');
  if (approval === 'required-missing') blockers.push('approval');
  if (['misconfigured', 'unknown'].includes(zanStatus)) blockers.push('zan-governance');
  if (zanStatus === 'adopted' && zanMust !== 'pass') blockers.push('zan-must');

  return {
    mergeAllowed: blockers.length === 0,
    blockers,
  };
}

function runCli() {
  const [command, payload = '{}'] = process.argv.slice(2);
  const input = JSON.parse(payload);
  if (command === 'classify-adoption') {
    process.stdout.write(`${JSON.stringify(classifyAdoption(input), null, 2)}\n`);
    return;
  }
  if (command === 'evaluate-merge') {
    process.stdout.write(`${JSON.stringify(evaluateMergeReadiness(input), null, 2)}\n`);
    return;
  }
  throw new Error('usage: review-policy.mjs <classify-adoption|evaluate-merge> <json>');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli();
}
