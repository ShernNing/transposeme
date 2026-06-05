// Unit tests for server internals. Run: node --test server/server_units.test.cjs
// Importing index.cjs is side-effect-free (server boot is guarded by require.main).
const { test } = require("node:test");
const assert = require("node:assert");
const { BoundedCache, isValidYouTubeUrl } = require("./index.cjs");

test("BoundedCache: basic get/set/has", () => {
  const c = new BoundedCache(2, 60000);
  c.set("a", 1);
  assert.strictEqual(c.get("a"), 1);
  assert.strictEqual(c.has("a"), true);
  assert.strictEqual(c.get("missing"), undefined);
  assert.strictEqual(c.has("missing"), false);
});

test("BoundedCache: LRU eviction at maxSize fires onEvict with dropped value", () => {
  const evicted = [];
  const c = new BoundedCache(2, 60000, (v) => evicted.push(v));
  c.set("a", "fileA");
  c.set("b", "fileB");
  c.set("c", "fileC"); // exceeds maxSize -> evicts oldest "a"
  assert.deepStrictEqual(evicted, ["fileA"]);
  assert.strictEqual(c.get("a"), undefined);
  assert.strictEqual(c.get("b"), "fileB");
  assert.strictEqual(c.get("c"), "fileC");
});

test("BoundedCache: overwrite evicts old value, keeps new", () => {
  const evicted = [];
  const c = new BoundedCache(2, 60000, (v) => evicted.push(v));
  c.set("a", "old");
  c.set("a", "new");
  assert.deepStrictEqual(evicted, ["old"]);
  assert.strictEqual(c.get("a"), "new");
});

test("BoundedCache: re-setting identical value does not evict", () => {
  const evicted = [];
  const c = new BoundedCache(2, 60000, (v) => evicted.push(v));
  c.set("a", "same");
  c.set("a", "same");
  assert.deepStrictEqual(evicted, []);
});

test("BoundedCache: TTL expiry evicts on access", async () => {
  const evicted = [];
  const c = new BoundedCache(5, 10, (v) => evicted.push(v)); // 10ms ttl
  c.set("a", "fileA");
  await new Promise((r) => setTimeout(r, 25));
  assert.strictEqual(c.get("a"), undefined);
  assert.deepStrictEqual(evicted, ["fileA"]);
});

test("isValidYouTubeUrl: accepts valid YouTube links", () => {
  assert.ok(isValidYouTubeUrl("https://www.youtube.com/watch?v=abc123"));
  assert.ok(isValidYouTubeUrl("https://youtu.be/abc123"));
  assert.ok(isValidYouTubeUrl("https://youtube.com/shorts/abc123"));
});

test("isValidYouTubeUrl: rejects non-YouTube / malformed", () => {
  assert.ok(!isValidYouTubeUrl("https://vimeo.com/123"));
  assert.ok(!isValidYouTubeUrl("not a url"));
  assert.ok(!isValidYouTubeUrl("https://evil.com/youtube.com/watch"));
  assert.ok(!isValidYouTubeUrl(""));
});
