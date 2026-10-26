// Check review completeness and freshness, not the truth of semantic claims.
const SHA = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;
const HASH = /^[a-f\d]{64}$/i;
const evidencePresent = value => Array.isArray(value) && value.length > 0
  && value.every(item => typeof item === 'string' && item.trim().length > 0);
const hashesValid = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.entries(value).every(([key, hash]) => key.trim() && typeof hash === 'string' && HASH.test(hash));

export function evaluateChangeConsistency(review, current) {
  const blockers = [];
  if (!review || !current || !['sourceSha', 'targetSha'].every(key =>
    typeof current[key] === 'string' && SHA.test(current[key]) && review[key] === current[key])) {
    blockers.push('change-review-stale');
  }
  for (const key of ['scope', 'impact']) {
    const result = review?.[key];
    if (result?.status === 'fail') blockers.push(`change-${key}`);
    else if (result?.status !== 'pass' || !evidencePresent(result.evidence)) {
      blockers.push(`change-${key}-unknown`);
    }
  }
  const docs = review?.documentation;
  if (docs?.status === 'fail') blockers.push('change-documentation');
  else if (!evidencePresent(docs?.evidence) || !(
    docs.status === 'pass' || docs.status === 'not-required'
    && ['NO_WIKI', 'NOT_APPLICABLE'].includes(docs.exemption)
  )) blockers.push('change-documentation-unknown');

  const before = review?.documentHashes, now = current?.documentHashes;
  if (!hashesValid(before) || !hashesValid(now)
      || Object.keys(before).length !== Object.keys(now).length
      || Object.keys(before).some(key => !Object.hasOwn(now, key) || before[key] !== now[key])
      || docs?.status === 'pass' && Object.keys(before).length === 0) {
    blockers.push('change-documentation-stale');
  }
  return { mergeAllowed: blockers.length === 0, blockers };
}
