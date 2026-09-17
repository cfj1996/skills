const path = require("node:path");
const { fileURLToPath } = require("node:url");

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function resolvePrototypeSource(source) {
  if (typeof source !== "string" || source.trim().length === 0) {
    fail("prototype-source-required", "prototype source is required");
  }

  const candidate = source.trim();
  if (path.isAbsolute(candidate)) {
    return {
      kind: "local-file",
      filePath: path.normalize(candidate),
      requiresLoopbackServer: true,
    };
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    fail(
      "prototype-file-path-must-be-absolute",
      "local prototype file paths must be absolute",
    );
  }

  if (url.protocol === "file:") {
    if (url.hostname && url.hostname !== "localhost") {
      fail("unsupported-prototype-source", "remote file URLs are unsupported");
    }
    return {
      kind: "local-file",
      filePath: fileURLToPath(url),
      requiresLoopbackServer: true,
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    fail("unsupported-prototype-source", "prototype source must be a local file or HTTP(S) URL");
  }

  if (url.username || url.password) {
    fail(
      "prototype-url-credentials-forbidden",
      "prototype URLs must not contain embedded credentials",
    );
  }

  const loopback = isLoopbackHostname(url.hostname);
  if (url.protocol === "http:" && !loopback) {
    fail(
      "remote-prototype-requires-https",
      "remote prototype URLs must use HTTPS",
    );
  }

  return {
    kind: loopback ? "loopback-url" : "remote-url",
    navigationUrl: url.href,
    requiresLoopbackServer: false,
  };
}

module.exports = {
  isLoopbackHostname,
  resolvePrototypeSource,
};
