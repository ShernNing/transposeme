import { RubberBandInterface } from "rubberband-wasm";

// Module-level cache — compiled once per page load, reused across all calls
let _cachedWasmModule = null;

async function getWasmModule() {
  if (_cachedWasmModule) return _cachedWasmModule;
  const wasmBinary = await fetch("/rubberband.wasm").then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch rubberband.wasm: ${r.status}`);
    return r.arrayBuffer();
  });
  _cachedWasmModule = await WebAssembly.compile(wasmBinary);
  return _cachedWasmModule;
}

// --- Chord transposition constants ---
const CHROMATIC_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHROMATIC_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_TO_IDX = {
  C: 0, "B#": 0,
  "C#": 1, Db: 1,
  D: 2,
  "D#": 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, "E#": 5,
  "F#": 6, Gb: 6,
  G: 7,
  "G#": 8, Ab: 8,
  A: 9,
  "A#": 10, Bb: 10,
  B: 11, Cb: 11,
};

/**
 * Transpose chord text from one key to another.
 * Finds every chord token (e.g. Am7, F#maj7, Bbsus4) and shifts its root note.
 *
 * @param {string} chordText - Raw chord sheet text
 * @param {string} fromKey   - Original key root, e.g. "G" or "Bb"
 * @param {string} toKey     - Target key root, e.g. "A" or "C#"
 * @returns {string} - Text with all chord roots transposed
 */
export function transposeChordSheet(chordText, fromKey, toKey) {
  if (!chordText || !fromKey || !toKey) return chordText;

  // Extract just the root note from a key label like "G major" or "Bb minor"
  const parseRoot = (key) => key.trim().split(/\s+/)[0];
  const fromRoot = parseRoot(fromKey);
  const toRoot = parseRoot(toKey);

  const fromIdx = NOTE_TO_IDX[fromRoot];
  const toIdx   = NOTE_TO_IDX[toRoot];
  if (fromIdx == null || toIdx == null) return chordText;

  const delta = (toIdx - fromIdx + 12) % 12;
  if (delta === 0) return chordText;

  // Regex: matches chord roots (with optional # or b) followed by optional chord quality
  // Negative lookbehind prevents matching note letters inside words (e.g. "the", "Am" in "Damage")
  const CHORD_RE = /\b([A-G][#b]?)((?:maj|min|m|M|sus|aug|dim|add|no)?(?:\d+)?(?:\/[A-G][#b]?)?)\b/g;

  return chordText.replace(CHORD_RE, (match, root, quality, offset, str) => {
    // Don't transpose if preceded by a letter (it's part of a word)
    const prevChar = offset > 0 ? str[offset - 1] : "";
    if (/[a-z]/i.test(prevChar) && !/[A-G]/.test(prevChar)) return match;

    const idx = NOTE_TO_IDX[root];
    if (idx == null) return match;

    const newIdx = (idx + delta) % 12;
    // Prefer flats if original root used a flat, or target key uses flats
    const useFlat = root.includes("b") || toRoot.includes("b");
    const newRoot = useFlat ? CHROMATIC_FLAT[newIdx] : CHROMATIC_SHARP[newIdx];

    // Also transpose any bass note after /
    const transposedQuality = quality.replace(/\/([A-G][#b]?)/, (_, bassRoot) => {
      const bassIdx = NOTE_TO_IDX[bassRoot];
      if (bassIdx == null) return `/${bassRoot}`;
      const newBassIdx = (bassIdx + delta) % 12;
      const newBass = useFlat ? CHROMATIC_FLAT[newBassIdx] : CHROMATIC_SHARP[newBassIdx];
      return `/${newBass}`;
    });

    return `${newRoot}${transposedQuality}`;
  });
}

/**
 * Transpose an AudioBuffer in-browser using rubberband-wasm.
 * Uses the offline study→process→retrieve pipeline.
 * @param {AudioBuffer} audioBuffer - The input audio buffer.
 * @param {number} semitones - Number of semitones to shift.
 * @returns {Promise<AudioBuffer>} - The transposed audio buffer.
 */
export async function transposeAudioBuffer(audioBuffer, semitones, { timeRatio = 1.0 } = {}) {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const numSamples = audioBuffer.length;

  // Early exit — no processing needed when pitch and tempo are unchanged
  if (semitones === 0 && timeRatio === 1.0) return audioBuffer;

  // Copy channel data to avoid detachment issues
  const channelBuffers = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelBuffers.push(new Float32Array(audioBuffer.getChannelData(ch)));
  }

  // Get cached (or freshly compiled) WASM module
  let wasmModule;
  try {
    wasmModule = await getWasmModule();
  } catch (e) {
    throw new Error("Failed to load WASM audio engine. " + (e?.message || ""));
  }

  let rb;
  try {
    rb = await RubberBandInterface.initialize(wasmModule);
  } catch (e) {
    throw new Error("Failed to initialize RubberBand WASM. " + (e?.message || ""));
  }

  const pitchScale = Math.pow(2, semitones / 12);

  // RubberBandOptionFormantPreserved = 16777216
  const rbState = rb.rubberband_new(sampleRate, numChannels, 16777216, timeRatio, pitchScale);
  rb.rubberband_set_pitch_scale(rbState, pitchScale);
  rb.rubberband_set_time_ratio(rbState, timeRatio);
  rb.rubberband_set_expected_input_duration(rbState, numSamples);

  const blockSize = rb.rubberband_get_samples_required(rbState);

  // Allocate WASM memory: array of channel pointers + one buffer per channel
  const channelArrayPtr = rb.malloc(numChannels * 4);
  const channelDataPtrs = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const ptr = rb.malloc(blockSize * 4);
    channelDataPtrs.push(ptr);
    rb.memWritePtr(channelArrayPtr + ch * 4, ptr);
  }

  // Study pass (required for offline mode)
  let read = 0;
  while (read < numSamples) {
    const count = Math.min(blockSize, numSamples - read);
    for (let ch = 0; ch < numChannels; ch++) {
      rb.memWrite(channelDataPtrs[ch], channelBuffers[ch].subarray(read, read + count));
    }
    read += count;
    rb.rubberband_study(rbState, channelArrayPtr, count, read >= numSamples ? 1 : 0);
  }

  // Process pass + retrieve output
  const outputChunks = Array.from({ length: numChannels }, () => []);
  let totalOutput = 0;

  const retrieve = (drainAll) => {
    while (true) {
      const available = rb.rubberband_available(rbState);
      if (available < 1) break;
      if (!drainAll && available < blockSize) break;
      const recv = rb.rubberband_retrieve(
        rbState,
        channelArrayPtr,
        Math.min(blockSize, available),
      );
      for (let ch = 0; ch < numChannels; ch++) {
        outputChunks[ch].push(rb.memReadF32(channelDataPtrs[ch], recv).slice());
      }
      totalOutput += recv;
    }
  };

  read = 0;
  while (read < numSamples) {
    const count = Math.min(blockSize, numSamples - read);
    for (let ch = 0; ch < numChannels; ch++) {
      rb.memWrite(channelDataPtrs[ch], channelBuffers[ch].subarray(read, read + count));
    }
    read += count;
    rb.rubberband_process(rbState, channelArrayPtr, count, read >= numSamples ? 1 : 0);
    retrieve(false);
  }
  retrieve(true);

  // Free WASM memory
  for (const ptr of channelDataPtrs) rb.free(ptr);
  rb.free(channelArrayPtr);
  rb.rubberband_delete(rbState);

  // Concatenate output chunks into a single Float32Array per channel
  const outputLength = totalOutput || numSamples;
  const context = new OfflineAudioContext(numChannels, outputLength, sampleRate);
  const outputBuffer = context.createBuffer(numChannels, outputLength, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const merged = new Float32Array(outputLength);
    let offset = 0;
    for (const chunk of outputChunks[ch]) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    outputBuffer.copyToChannel(merged, ch);
  }

  return outputBuffer;
}
