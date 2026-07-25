import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let resolvePrototypeSource;
try {
  ({ resolvePrototypeSource } = require("../scripts/resolve-prototype-source.js"));
} catch {
  resolvePrototypeSource = undefined;
}

test("classifies secure remote prototypes for direct browser navigation", () => {
  assert.equal(typeof resolvePrototypeSource, "function", "resolvePrototypeSource must exist");
  assert.deepEqual(
    resolvePrototypeSource("https://prototype.example.test/orders?revision=7#filter"),
    {
      kind: "remote-url",
      navigationUrl: "https://prototype.example.test/orders?revision=7#filter",
      requiresLoopbackServer: false,
    },
  );
});

test("keeps loopback URLs and local files on the local-server path", () => {
  assert.equal(typeof resolvePrototypeSource, "function", "resolvePrototypeSource must exist");
  assert.deepEqual(
    resolvePrototypeSource("http://127.0.0.1:4173/prototype.html"),
    {
      kind: "loopback-url",
      navigationUrl: "http://127.0.0.1:4173/prototype.html",
      requiresLoopbackServer: false,
    },
  );
  assert.deepEqual(
    resolvePrototypeSource("/workspace/docs/prototype/index.html"),
    {
      kind: "local-file",
      filePath: "/workspace/docs/prototype/index.html",
      requiresLoopbackServer: true,
    },
  );
  assert.deepEqual(
    resolvePrototypeSource("file:///workspace/docs/prototype/index.html"),
    {
      kind: "local-file",
      filePath: "/workspace/docs/prototype/index.html",
      requiresLoopbackServer: true,
    },
  );
});

test("rejects unsafe or ambiguous prototype sources", () => {
  assert.equal(typeof resolvePrototypeSource, "function", "resolvePrototypeSource must exist");
  for (const [source, expectedCode] of [
    ["http://prototype.example.test/orders", "remote-prototype-requires-https"],
    ["https://user:secret@prototype.example.test/orders", "prototype-url-credentials-forbidden"],
    ["javascript:alert(1)", "unsupported-prototype-source"],
    ["data:text/html,prototype", "unsupported-prototype-source"],
    ["docs/prototype.html", "prototype-file-path-must-be-absolute"],
    ["", "prototype-source-required"],
  ]) {
    assert.throws(
      () => resolvePrototypeSource(source),
      (error) => error?.code === expectedCode,
      `${source || "<empty>"} should fail with ${expectedCode}`,
    );
  }
});
