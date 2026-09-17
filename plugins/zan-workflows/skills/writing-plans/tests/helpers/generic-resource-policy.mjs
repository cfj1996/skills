const locationKey = ({ path, line }) => `${path}\u0000${line}`;

const lineNumberAt = (content, index) =>
  content.slice(0, index).split(/\r?\n/).length;

const globalPattern = (pattern) =>
  new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);

const increment = (counts, key) => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

export function inspectGenericResourcePolicy(resources, policy) {
  const violations = [];

  for (const { id, pattern } of policy.forbiddenPatterns) {
    for (const resource of resources) {
      const matcher = globalPattern(pattern);
      for (const match of resource.content.matchAll(matcher)) {
        violations.push({
          code: id,
          path: resource.path,
          line: lineNumberAt(resource.content, match.index),
          match: match[0],
        });
      }
    }
  }

  for (const { literal, occurrences } of policy.literalAllowlists) {
    const expectedCounts = new Map();
    const actualCounts = new Map();

    for (const occurrence of occurrences) {
      increment(expectedCounts, locationKey(occurrence));
    }

    for (const resource of resources) {
      for (const line of resource.content.split(/\r?\n/)) {
        let offset = 0;
        while ((offset = line.indexOf(literal, offset)) !== -1) {
          increment(actualCounts, locationKey({ path: resource.path, line }));
          offset += literal.length;
        }
      }
    }

    const keys = new Set([...expectedCounts.keys(), ...actualCounts.keys()]);
    for (const key of keys) {
      const expected = expectedCounts.get(key) ?? 0;
      const actual = actualCounts.get(key) ?? 0;
      const [resourcePath, line] = key.split("\u0000");
      for (let index = expected; index < actual; index += 1) {
        violations.push({
          code: "literal-not-allowlisted",
          literal,
          path: resourcePath,
          line,
        });
      }
      for (let index = actual; index < expected; index += 1) {
        violations.push({
          code: "literal-allowlist-missing",
          literal,
          path: resourcePath,
          line,
        });
      }
    }
  }

  return violations.sort((left, right) =>
    left.code.localeCompare(right.code) ||
    left.path.localeCompare(right.path) ||
    String(left.line).localeCompare(String(right.line)));
}
