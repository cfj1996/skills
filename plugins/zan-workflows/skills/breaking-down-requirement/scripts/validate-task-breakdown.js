const { createHash } = require('node:crypto');

const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const texts = (value, nonempty = true) => Array.isArray(value) && (!nonempty || value.length > 0) && value.every(text) && new Set(value).size === value.length;
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fingerprintProposal = proposal => createHash('sha256').update(JSON.stringify(canonical(proposal))).digest('hex');
// Strip only paired Markdown wrappers; punctuation inside a key remains part of its identity.
function hasTaskMarker(description, storyId, key) {
  if (typeof description !== 'string') return false;
  const marker = `zan-task:${storyId}:${key}`;
  return description.split(/[\s<>"'`()\[\]{}]+/u).some(token => {
    while (token !== marker) {
      const wrapper = ['**', '__', '~~', '*', '_'].find(value =>
        token.length > value.length * 2 && token.startsWith(value) && token.endsWith(value));
      if (!wrapper) return false;
      token = token.slice(wrapper.length, -wrapper.length);
    }
    return true;
  });
}

// Fixed-point inputs support up to four decimal places; final estimates use whole hours.
function units(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) return null;
  return BigInt(match[1]) * 10000n + BigInt((match[2] || '').padEnd(4, '0'));
}

function estimateHours(normalHours) {
  const normal = units(normalHours);
  if (normal === null) throw new Error('Invalid normal hours');
  const numerator = normal * 4n;
  const denominator = 50000n;
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

function validateTaskBreakdown(proposal) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push({ code: 'task-breakdown', message }); };
  if (!object(proposal)) return { valid: false, errors: [{ code: 'task-breakdown', message: 'proposal must be an object' }] };
  check(proposal.schemaVersion === 1, 'task breakdown schemaVersion must be 1');
  const requirement = proposal.requirement || {};
  check(requirement.type === 'story' && text(requirement.workspaceId) && text(requirement.id), 'requirement must identify exact Story and workspace');
  check(text(proposal.scopeFingerprint), 'scopeFingerprint is required');
  const binding = proposal.fieldBinding || {};
  check(['storyField', 'ownerField', 'estimateField', 'evidence'].every(key => text(binding[key])), 'actual task field binding and evidence are required');
  check(new Set([binding.storyField, binding.ownerField, binding.estimateField]).size === 3, 'task fields must be distinct');
  const precisionValid = Number.isInteger(binding.precision) && binding.precision >= 0 && binding.precision <= 4;
  check(binding.unit === 'hours' && precisionValid, 'task estimates require evidenced hours unit and precision 0..4');
  const tasks = Array.isArray(proposal.tasks) ? proposal.tasks : [];
  check(tasks.length > 0, 'task list is required');
  const byKey = new Map();
  const ids = new Set();
  for (const task of tasks) {
    if (!object(task)) { check(false, 'task must be an object'); continue; }
    check(text(task.key) && !byKey.has(task.key), 'task key must be unique and nonempty');
    byKey.set(task.key, task);
    check(['CREATE', 'REUSE', 'UPDATE'].includes(task.action), `${task.key}: unsupported action`);
    if (task.action === 'CREATE') check(task.id === undefined && task.beforeFingerprint === undefined, `${task.key}: CREATE must not carry existing identity`);
    else {
      check(text(task.id) && text(task.beforeFingerprint), `${task.key}: existing task ID and beforeFingerprint are required`);
      check(!ids.has(task.id), `${task.key}: existing task ID must be unique`);
      ids.add(task.id);
    }
    check(['project', 'deliveryUnitKey', 'name', 'scope'].every(key => text(task[key])), `${task.key}: project, module, name and scope are required`);
    check(texts(task.featureRefs) && texts(task.acceptance) && texts(task.exclusions, false) && texts(task.dependsOn, false), `${task.key}: featureRefs, acceptance, exclusions and dependsOn must be valid arrays`);
    check(text(task.owner?.account) && text(task.owner?.evidence), `${task.key}: verified developer account is required`);
    const estimate = task.estimate || {};
    const parts = Array.isArray(estimate.parts) ? estimate.parts : [];
    const validParts = parts.length > 0 && parts.every(part => object(part) && text(part.label) && units(part.hours) !== null);
    check(validParts && units(estimate.normalHours) !== null, `${task.key}: positive normal workload and parts are required`);
    if (validParts && units(estimate.normalHours) !== null) check(parts.reduce((sum, part) => sum + units(part.hours), 0n) === units(estimate.normalHours), `${task.key}: normal workload must equal parts total`);
    check(estimate.factor === 0.8 && text(estimate.basis), `${task.key}: estimate policy validation failed`);
    check(Number.isSafeInteger(estimate.hours) && estimate.hours > 0, `${task.key}: final estimate must be a positive integer number of hours`);
    if (units(estimate.normalHours) !== null) check(estimate.hours === estimateHours(estimate.normalHours), `${task.key}: final estimate calculation is invalid`);
    const payload = task.payload || {};
    const historicalDescription = Object.hasOwn(payload, 'description') &&
      (typeof payload.description === 'string' || payload.description === null);
    const stableIdentity = hasTaskMarker(payload.description, requirement.id, task.key) ||
      (task.action === 'REUSE' && historicalDescription && text(task.linkEvidence));
    check(payload.name === task.name && stableIdentity, `${task.key}: payload requires approved title and stable description marker or evidenced REUSE identity`);
    check(payload[binding.storyField] === requirement.id && payload[binding.ownerField] === task.owner?.account && payload[binding.estimateField] === estimate.hours, `${task.key}: payload must bind Story, developer and estimated hours`);
    check((payload.id === undefined || payload.id === task.id) && (payload.workspace_id === undefined || String(payload.workspace_id) === requirement.workspaceId), `${task.key}: payload identity conflicts with target`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(key) {
    if (visiting.has(key)) { check(false, `dependency cycle at ${key}`); return; }
    if (visited.has(key)) return;
    visiting.add(key);
    const dependencies = byKey.get(key)?.dependsOn;
    for (const dependency of Array.isArray(dependencies) ? dependencies : []) {
      check(byKey.has(dependency), `${key}: missing dependency ${dependency}`);
      if (byKey.has(dependency)) visit(dependency);
    }
    visiting.delete(key); visited.add(key);
  }
  // Invalid array inputs have already failed; do not iterate hostile shapes.
  for (const [key, task] of byKey) if (Array.isArray(task.dependsOn)) visit(key);
  return { valid: errors.length === 0, errors };
}

function validateConfirmation(proposal, receipt) {
  const result = validateTaskBreakdown(proposal);
  if (!result.valid) return result;
  if (!text(receipt?.source) || receipt?.proposalFingerprint !== fingerprintProposal(proposal)) result.errors.push({ code: 'task-confirmation', message: 'current human confirmation must bind the unchanged proposal fingerprint' });
  result.valid = result.errors.length === 0;
  return result;
}

function validateTaskReadbacks(proposal, records) {
  const result = validateTaskBreakdown(proposal);
  if (!result.valid) return result;
  const fail = message => result.errors.push({ code: 'task-readback', message });
  if (!Array.isArray(records)) { fail('exact task readback records are required'); result.valid = false; return result; }
  const ids = new Set(), keys = new Set();
  for (const record of records) {
    const task = proposal?.tasks?.find(task => task?.key === record?.key);
    if (!task || !text(record?.id) || keys.has(record.key) || ids.has(record.id)) { fail('unknown, duplicate or missing readback identity'); continue; }
    ids.add(record.id); keys.add(record.key);
    if (task.action !== 'CREATE' && record.id !== task.id) fail(`${task.key}: readback task ID changed`);
    const readback = record.readback || {};
    if (readback.id !== record.id || readback.workspaceId !== proposal.requirement.workspaceId || readback.storyId !== proposal.requirement.id || readback.ownerAccount !== task.owner?.account || readback.estimateHours !== task.estimate?.hours) fail(`${task.key}: readback Task, Story, developer or hours mismatch`);
    for (const [key, value] of Object.entries(task.payload || {})) if (!equal(readback.payload?.[key], value)) fail(`${task.key}: readback approved payload mismatch for ${key}`);
  }
  if (keys.size !== proposal?.tasks?.length) fail('not every task has an exact readback');
  result.valid = result.errors.length === 0;
  return result;
}

function validatePlanTaskBindings(model, { implementationStage = false } = {}) {
  const identity = model.tapdRequirement;
  const identityValid = object(identity) && identity.type === 'story' && text(identity.id) && text(identity.workspaceId);
  if (model.taskBreakdown === undefined) {
    const errors = [];
    if (identity !== undefined && !identityValid) errors.push({ code: 'plan-task-binding', message: 'Plan TAPD parent Story identity is invalid' });
    if (identity !== undefined && implementationStage) errors.push({ code: 'plan-task-binding', message: 'implementation-stage TAPD Plan requires TASKS_READY records' });
    return { valid: errors.length === 0, errors };
  }
  const breakdown = model.taskBreakdown || {};
  const result = validateTaskReadbacks(breakdown.proposal, breakdown.records);
  const fail = message => result.errors.push({ code: 'plan-task-binding', message });
  if (!result.valid) return result;
  const parent = breakdown.proposal.requirement;
  if (!identityValid || identity.id !== parent.id || identity.workspaceId !== parent.workspaceId) fail('Plan TAPD parent Story differs from task proposal');
  if (breakdown.proposalFingerprint !== fingerprintProposal(breakdown.proposal)) fail('Plan task proposal fingerprint changed');
  if (!text(breakdown.project) || !text(breakdown.deliveryUnitKey) || model.deliveryUnit?.key !== breakdown.deliveryUnitKey) fail('Plan project and delivery unit identity are required');
  const relevant = breakdown.proposal.tasks.filter(task => task.project === breakdown.project && task.deliveryUnitKey === breakdown.deliveryUnitKey);
  if (!relevant.length) fail('no TAPD tasks belong to this Plan');
  const features = new Set((Array.isArray(model.features) ? model.features : []).filter(object).map(feature => feature.id));
  const steps = Array.isArray(model.tasks) ? model.tasks : [];
  for (const step of steps) {
    const task = relevant.find(task => task.key === step?.tapdTaskKey);
    if (!task) { fail(`Plan step ${step?.id}: TAPD Task belongs to another project/module or is missing`); continue; }
    if (!texts(step.featureRefs) || step.featureRefs.some(ref => !features.has(ref) || !task.featureRefs.includes(ref))) fail(`Plan step ${step.id}: function falls outside its TAPD Task`);
  }
  for (const task of relevant) {
    const refs = new Set(steps.filter(step => step?.tapdTaskKey === task.key).flatMap(step => Array.isArray(step.featureRefs) ? step.featureRefs : []));
    if (task.featureRefs.some(ref => !features.has(ref) || !refs.has(ref))) fail(`${task.key}: Plan must cover every assigned function`);
  }
  result.valid = result.errors.length === 0;
  return result;
}

module.exports = { estimateHours, fingerprintProposal, validateTaskBreakdown, validateConfirmation, validateTaskReadbacks, validatePlanTaskBindings };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const proposal = JSON.parse(input);
      const result = validateTaskBreakdown(proposal);
      process.stdout.write(JSON.stringify({ ...result, proposalFingerprint: result.valid ? fingerprintProposal(proposal) : null }) + '\n');
      if (!result.valid) process.exitCode = 1;
    } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
  });
}
