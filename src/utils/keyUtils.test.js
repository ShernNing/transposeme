// Unit tests for transposeDetectedKey. Run: node --test src/utils/keyUtils.test.js
import { test } from "node:test";
import assert from "node:assert";
import { transposeDetectedKey } from "./keyUtils.js";

test("shifts root up by semitones", () => {
  assert.strictEqual(transposeDetectedKey("C", 2), "D");
  assert.strictEqual(transposeDetectedKey("A", -2), "G");
});

test("preserves quality (major/minor)", () => {
  assert.strictEqual(transposeDetectedKey("C major", 2), "D major");
  assert.strictEqual(transposeDetectedKey("A minor", 3), "C minor");
});

test("wraps around the octave", () => {
  assert.strictEqual(transposeDetectedKey("B", 1), "C");
  assert.strictEqual(transposeDetectedKey("C", -1), "B");
});

test("uses sharps by default, flats when root is flat", () => {
  assert.strictEqual(transposeDetectedKey("C", 1), "C#");
  assert.strictEqual(transposeDetectedKey("Ab", 2), "Bb");
});

test("zero shift returns same key", () => {
  assert.strictEqual(transposeDetectedKey("F# minor", 0), "F# minor");
});

test("empty / unknown input handled", () => {
  assert.strictEqual(transposeDetectedKey("", 3), "");
  assert.strictEqual(transposeDetectedKey("H", 1), "H");
});
