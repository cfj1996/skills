// Shared explicit no-Mock inspection fixtures for legacy delivery tests. New
// safety behavior tests import the production helpers directly and exercise
// missing, stale, denied, and mixed inventories without these wrappers.
import { sha256 } from '../../scripts/workflow-runtime.mjs';
import { mergeReviewedBranch } from '../../scripts/merge-reviewed-branch.mjs';
import { runJenkinsRelease } from '../../scripts/run-jenkins-release.mjs';
import { registerTestSubmission } from '../../scripts/register-test-submission.mjs';
import { ensureTestWiki } from '../../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { markPendingMergeWiki } from '../../scripts/pending-merge-wiki.mjs';
import { WorkflowSession } from '../../scripts/workflow-session.mjs';

export function noMockFixture(input = {}) {
  const sourceRepository = input.originUrl || input.sourceRepository || input.entryRepoUrl || 'https://git.example.test/team/demo.git';
  const sourceSha = input.sourceSha || input.expectedSha || 'a'.repeat(40);
  return { schemaVersion: 1, repositoryPath: input.repositoryPath || '/fixture/demo', sourceRepository, sourceSha,
    baseSha: 'b'.repeat(40), inspectedPaths: ['.'], mockBindingPaths: ['package.json'], runtimePaths: ['src'],
    scopeFingerprint: sha256('fixture-reviewed-source-and-diff'), contentFingerprint: sha256('fixture-source-content'),
    evidenceRefs: ['fixture: complete source, activation and import inventory inspected; no Mock'], mockModules: [] };
}
export const fixtureMockIo = {
  inspectMockSource: async safety => ({ sourceSha: safety.sourceSha, baseSha: safety.baseSha,
    inspectedPaths: safety.inspectedPaths, scopeFingerprint: safety.scopeFingerprint,
    contentFingerprint: safety.contentFingerprint, changedPaths: [], markedPaths: (safety.mockModules || []).filter(row => row.status === 'active').map(row => row.paths[0]),
    markerBindings: (safety.mockModules || []).filter(row => row.status === 'active').map(row => ({ path: row.paths[0], moduleIds: [row.id] })), fileFingerprints: { 'package.json': sha256('fixture-config') }, writes: 0 }),
  verifyMockCommittedContent: async () => {},
  readMockEnvironmentSource: async binding => binding.mappingText,
};
export function withNoMockFixture(input) {
  if (input.mockSafety || input.mockSafeties) return input;
  const safety = noMockFixture(input);
  return { ...input, mockSafety: safety, requiredRepositories: [safety.sourceRepository],
    gitDeliveryReceipts: [{ state: 'VERIFIED', containment: true, targetBranch: input.targetBranch || 'develop', originUrl: safety.sourceRepository, sourceSha: safety.sourceSha, deliveredSha: safety.sourceSha }],
    mockRepositories: [{ sourceRepository: safety.sourceRepository, sourceSha: safety.sourceSha }] };
}
function releaseFixture(input, reader) {
  let build;
  const wrappedReader = { ...reader, build: async number => { build = await reader.build(number); return build; },
    console: async number => {
      const original = reader.console ? await reader.console(number) : '';
      const production = input.releaseChannel === 'official' || /production|prod|正式|线上/i.test(input.targetEnvironment || '');
      return !production ? original : original + '\nMOCK_PRODUCTION_GATE ' + JSON.stringify({ state: 'PASSED',
        sourceSha: input.expectedSha, jobUrl: input.jobUrl, queueId: build?.queueId, buildNumber: number,
        artifactFingerprint: sha256('fixture-final-artifact'), beforeDeploy: true, runtimeEnabled: false, remainingMockPaths: [] });
    } };
  const preDeployMockGate = { state: 'VERIFIED', jobBindingHash: input.jobBindingHash || input.jobConfigHash,
    sourceSha: input.expectedSha, jobUrl: input.jobUrl, pipelineContentHash: input.mockPipelineContent ? sha256(input.mockPipelineContent) : undefined, checkCommand: 'fixture check-mock-artifact',
    deployStep: 'fixture deploy', evidenceRefs: ['fixture: reviewed fail-closed stage order'], failClosed: true,
    beforeDeploy: true, artifactMarker: 'MOCK_PRODUCTION_GATE' };
  const mappingText = JSON.stringify({ jobUrl: input.jobUrl, targetEnvironment: input.targetEnvironment, releaseChannel: input.releaseChannel,
    environmentKind: input.releaseChannel === 'official' || /prod|production|正式|线上/i.test(input.targetEnvironment || '') ? 'production' : 'test' });
  const environmentBinding = { kind: 'project-policy', ...JSON.parse(mappingText), sourcePath: '/fixture/AGENTS.md', sourceHash: sha256(mappingText),
    jobBindingHash: input.jobBindingHash || input.jobConfigHash, parameterDefinitionsHash: input.parameterDefinitionsHash, mappingText, evidenceRefs: ['fixture: authoritative project-to-Job environment map'] };
  return { input: { ...withNoMockFixture(input), environmentBinding: input.environmentBinding || (input.execute ? environmentBinding : undefined), preDeployMockGate: input.preDeployMockGate || (input.execute ? preDeployMockGate : undefined) }, reader: wrappedReader };
}
export const fixtureMergeReviewedBranch = (call, input, io = {}) => mergeReviewedBranch(call, withNoMockFixture(input), { ...fixtureMockIo, ...io });
export const fixtureRegisterTestSubmission = (call, input, io = {}) => registerTestSubmission(call, withNoMockFixture(input), { ...fixtureMockIo, ...io });
export const fixtureEnsureTestWiki = (call, input, now = new Date(), io = {}) => ensureTestWiki(call, withNoMockFixture(input), now, { ...fixtureMockIo, ...io });
export function fixtureRunJenkinsRelease(call, reader, input, io = {}) {
  const fixture = releaseFixture(input, reader);
  return runJenkinsRelease(call, fixture.reader, fixture.input, { ...fixtureMockIo, ...io });
}
export class FixtureWorkflowSession extends WorkflowSession {
  constructor(options = {}) {
    super({ ...options, io: { ...fixtureMockIo, ...options.io }, reader: input => {
      const reader = options.reader(input);
      return releaseFixture(input, reader).reader;
    } });
  }
  dispatch(request) {
    if (!request?.input || !['merge', 'release', 'registration', 'wiki'].includes(request.action)) return super.dispatch(request);
    const input = withNoMockFixture(request.input);
    if (request.action === 'release') {
      const release = releaseFixture({ ...input, execute: request.phase === 'EXECUTE' }, {}).input;
      input.preDeployMockGate ||= release.preDeployMockGate; input.environmentBinding ||= release.environmentBinding;
    }
    return super.dispatch({ ...request, input });
  }
}

export const fixtureMarkPendingMergeWiki = (gitlab, tapd, plan, merge, options = {}) => markPendingMergeWiki(gitlab, tapd,
  { ...plan, ...withNoMockFixture({ ...merge, ...plan }) }, merge, { ...options, io: { ...fixtureMockIo, ...options.io } });
