import { sha256, stableJson } from '../../scripts/workflow-runtime.mjs';

// Test-only snapshot construction. Legacy release tests already supply fake
// Jenkins definitions; this turns those fixtures into the on-disk contract
// shape without adding a production online fallback.
export function frozenJenkinsFixture(input, definitions, instanceUrl = new URL(input.jobUrl).origin) {
  const parameters = definitions.parameters.map(parameter => ({ ...parameter,
    type: parameter.type || (parameter.choices ? 'choice' : 'string'), description: parameter.description || '',
    ...(!Object.hasOwn(parameter, 'defaultValue') && !(parameter.sensitive || parameter.type === 'password')
      ? { defaultValue: parameter.choices?.[0] ?? '' } : {}),
  }));
  const fixedParams = {};
  const names = new Set(parameters.map(parameter => parameter.name));
  const channelParameter = names.has('RELEASE_TYPE') ? 'RELEASE_TYPE' : names.has('CHANNEL') ? 'CHANNEL' : input.channelParameter;
  if (channelParameter) {
    const choices = parameters.find(parameter => parameter.name === channelParameter)?.choices || [];
    const selected = choices.find(value => input.releaseChannel === 'official'
      ? /latest|stable|official|production|release:prod/.test(value) : /canary|alpha|beta|next|rc|test/.test(value));
    if (selected !== undefined) fixedParams[channelParameter] = selected;
  }
  if (parameters.some(parameter => parameter.name === 'RELEASE_TYPE')) {
    fixedParams.RELEASE_TYPE = input.releaseChannel === 'official' ? 'release:prod' : 'release:canary';
  }
  const profile = { environmentKind: input.releaseChannel === 'official' || /prod|production|正式|线上/i.test(input.targetEnvironment || '') ? 'production' : 'test',
    targetEnvironment: input.targetEnvironment, releaseChannel: input.releaseChannel, fixedParams,
    allowedProjects: [input.jenkinsProjectKey || input.targetProject],
    ...(names.has('REF') ? { refParameter: 'REF' } : names.has('branch') ? { refParameter: 'branch' } : {}),
    ...(names.has('VERSION') ? { versionParameter: 'VERSION' } : input.versionParameter ? { versionParameter: input.versionParameter } : {}),
    ...(channelParameter ? { channelParameter } : {}),
    ...(parameters.some(parameter => parameter.name === 'PROJECT_NAME') ? { projectParameter: 'PROJECT_NAME' } : {}),
  };
  return JSON.stringify({ schemaVersion: 1, instance: { name: input.instance || 'default', url: instanceUrl },
    projectJobs: { [input.jenkinsProjectKey || input.targetProject]: input.jobName },
    jobs: { [input.jobName]: { status: 'ready', jobName: input.jobName, jobUrl: input.jobUrl, parameters,
      parameterDefinitionsHash: sha256(stableJson({ jobName: input.jobName, parameters })), profiles: { [input.jenkinsProfile || 'fixture']: profile } } } });
}
