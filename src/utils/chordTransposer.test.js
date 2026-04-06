import { fetchAllChordSheets } from "./chordFetchers.js";
import { transposeChordSheet } from "./wasmTransposer.js";

async function testFetchAndTranspose() {
  const songTitle = "Let It Be";
  const artist = "The Beatles";
  const targetKey = "G";
  const results = await fetchAllChordSheets({ songTitle, artist });
  if (!results.length) {
    console.error("No chord sheets fetched.");
    return;
  }
  const original = results[0];
  console.log("Fetched from:", original.source);
  console.log("Original Chord Sheet:\n", original.text.slice(0, 300));
  // Guess original key (simple heuristic)
  const guessKey = (original.key || "C");
  const transposed = transposeChordSheet(original.text, guessKey, targetKey);
  console.log("Transposed Chord Sheet (first 300 chars):\n", transposed.slice(0, 300));
}

testFetchAndTranspose();
