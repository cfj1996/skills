// Shared explicit no-Mock inspection fixtures for legacy delivery tests. New
// safety behavior tests import the production helpers directly and exercise
// missing, stale, denied, and mixed inventories without these wrappers.
import { sha256 } from '../../scripts/workflow-runtime.mjs';
import { projectMockIntegrationFingerprint } from '../../scripts/project-mock-gate.mjs';
import { mergeReviewedBranch } from '../../scripts/merge-reviewed-branch.mjs';
import { runJenkinsRelease } from '../../scripts/run-jenkins-release.mjs';
import { registerTestSubmission } from '../../scripts/register-test-submission.mjs';
import { ensureTestWiki } from '../../skills/submitting-for-test/scripts/ensure-test-wiki.mjs';
import { markPendingMergeWiki } from '../../scripts/pending-merge-wiki.mjs';
import { WorkflowSession } from '../../scripts/workflow-session.mjs';
import { frozenJenkinsFixture } from './frozen-jenkins-fixture.mjs';
import { validateWait } from '../../scripts/workflow-runtime.mjs';

const projectCheckerSource = '// Fixture reviewed project checker; production behavior uses real scripts in project-mock-gate.test.mjs\n';
const projectCheckerConfig = '{"schemaVersion":1,"sourcePaths":["src"],"artifactPaths":["lib"]}\n';
const projectReleaseSource = '#!/bin/sh\nset -eu\nnode scripts/check-mock.mjs --phase artifact --config mock-safety.config.json\nnpm publish\n';
export function projectMockFixture(input = {}) {
  const sourceRepository = input.sourceRepository || input.originUrl || 'https://git.example.test/team/demo.git';
  const sourceSha = input.expectedSha || input.sourceSha || 'a'.repeat(40);
  const files = [{ path: 'scripts/release.sh', contentHash: sha256(projectReleaseSource) }];
  return { schemaVersion: 1, repositoryPath: input.repositoryPath || '/fixture/demo', sourceRepository, sourceSha,
    checker: { scriptPath: 'scripts/check-mock.mjs', contentHash: sha256(projectCheckerSource),
      configPath: 'mock-safety.config.json', configHash: sha256(projectCheckerConfig) },
    integration: { repositoryPath: input.repositoryPath || '/fixture/demo', sourceRepository, sourceSha,
      files, entrypoint: 'scripts/release.sh',
      checkerInvocation: 'node scripts/check-mock.mjs --phase artifact --config mock-safety.config.json',
      publishInvocation: 'npm publish', evidenceRefs: ['fixture: actual release entry reviewed'],
      review: { state: 'VERIFIED', sourceSha, filesFingerprint: projectMockIntegrationFingerprint(files),
        checkedBeforePublish: true, failClosed: true, noBypass: true, evidenceRefs: ['fixture: exact release entry independent review'] } } };
}
export function projectSourceReceipt(gate) {
  return { schemaVersion: 1, phase: 'source', state: 'PASSED', sourceSha: gate.sourceSha,
    checkerHash: gate.checker.contentHash, configHash: gate.checker.configHash,
    sourceFingerprint: sha256('fixture-project-source'), remainingMockPaths: [], runtimeEnabled: false };
}
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
  readProjectMockFile: async row => {
    const content = { 'scripts/check-mock.mjs': projectCheckerSource, 'mock-safety.config.json': projectCheckerConfig,
      'scripts/release.sh': projectReleaseSource }[row.path];
    if (content === undefined) throw new Error('Unknown fixture project file: ' + row.path);
    return content;
  },
  executeProjectMockSource: async ({ gate }) => 'MOCK_SOURCE_GATE ' + JSON.stringify(projectSourceReceipt(gate)),
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
  const gate = input.projectMockGate || projectMockFixture(input);
  const wrappedReader = { ...reader, build: async number => { build = await reader.build(number); return build; },
    console: async number => {
      const original = reader.console ? await reader.console(number) : '';
      const production = input.releaseChannel === 'official' || /production|prod|正式|线上/i.test(input.targetEnvironment || '');
      return !production ? original : original + '\nMOCK_PRODUCTION_GATE ' + JSON.stringify({
        ...projectSourceReceipt(gate), phase: 'artifact', jobUrl: input.jobUrl, queueId: build?.queueId, buildNumber: number,
        artifactFingerprint: sha256('fixture-final-artifact'), beforeDeploy: true });
    } };
  return { input: { ...withNoMockFixture(input), projectMockGate: gate }, reader: wrappedReader };
}
export const fixtureMergeReviewedBranch = (call, input, io = {}) => mergeReviewedBranch(call, withNoMockFixture(input), { ...fixtureMockIo, ...io });
export const fixtureRegisterTestSubmission = (call, input, io = {}) => registerTestSubmission(call, withNoMockFixture(input), { ...fixtureMockIo, ...io });
export const fixtureEnsureTestWiki = (call, input, now = new Date(), io = {}) => ensureTestWiki(call, withNoMockFixture(input), now, { ...fixtureMockIo, ...io });
export async function fixtureRunJenkinsRelease(call, reader, input, io = {}) {
  validateWait(io);
  const fixture = releaseFixture(input, reader);
  const definitions = io.frozenFixtureDefinitions;
  if (!definitions && !io.readFrozenJenkinsContracts) throw new Error('Legacy test must provide explicit frozen parameter fixture');
  const registry = definitions ? frozenJenkinsFixture(input, definitions, reader.instanceUrl) : undefined;
  return runJenkinsRelease(call, fixture.reader, { ...fixture.input, jenkinsContractsPath: '/fixture/jenkins-build-contracts.json' },
    { ...fixtureMockIo, readFrozenJenkinsContracts: async () => registry, ...io });
}
export class FixtureWorkflowSession extends WorkflowSession {
  constructor(options = {}) {
    super({ ...options, io: { ...fixtureMockIo, ...options.io }, reader: input => {
      const reader = options.reader(input);
      return releaseFixture(input, reader).reader;
    } });
  }
  async dispatch(request) {
    if (!request?.input || !['merge', 'release', 'registration', 'wiki'].includes(request.action)) return super.dispatch(request);
    const input = withNoMockFixture(request.input);
    if (request.action === 'release') {
      const release = releaseFixture({ ...input, execute: request.phase === 'EXECUTE' }, {}).input;
      input.projectMockGate ||= release.projectMockGate;
      if (this.io.frozenFixtureDefinitions) {
        const registry = frozenJenkinsFixture(input, this.io.frozenFixtureDefinitions, this.reader(input).instanceUrl);
        this.io.readFrozenJenkinsContracts = async () => registry;
      }
      input.jenkinsContractsPath = '/fixture/jenkins-build-contracts.json';
    }
    return super.dispatch({ ...request, input });
  }
}

export const fixtureMarkPendingMergeWiki = (gitlab, tapd, plan, merge, options = {}) => markPendingMergeWiki(gitlab, tapd,
  { ...plan, ...withNoMockFixture({ ...merge, ...plan }) }, merge, { ...options, io: { ...fixtureMockIo, ...options.io } });
