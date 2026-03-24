import { RubberBandInterface } from "rubberband-wasm";
/**
 * Transpose an AudioBuffer in-browser using rubberband-wasm.
 * @param {AudioBuffer} audioBuffer - The input audio buffer.
 * @param {number} semitones - Number of semitones to shift.
 * @returns {Promise<AudioBuffer>} - The transposed audio buffer.
 */
export async function transposeAudioBuffer(audioBuffer, semitones) {
  const context = new (
    window.OfflineAudioContext || window.webkitOfflineAudioContext
  )(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);

  // Convert AudioBuffer to Float32Array[]
  const channelData = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    // Copy to new Float32Array to avoid detachment issues
    channelData.push(new Float32Array(audioBuffer.getChannelData(ch)));
  }

  // Initialize RubberBand WASM
  const rb = await RubberBandInterface.initialize();
  // rubberband-wasm expects a pitch scale ratio, not semitone steps.
  const pitchScale = Math.pow(2, semitones / 12);

  // Set options for pitch shifting.
  const options = {
    pitch: pitchScale,
    formant: true,
    tempo: 1,
  };
  // Process audio
  const result = rb.process(channelData, audioBuffer.sampleRate, options);

  // Create new AudioBuffer from result
  const outputBuffer = context.createBuffer(
    audioBuffer.numberOfChannels,
    result[0].length,
    audioBuffer.sampleRate,
  );
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    outputBuffer.copyToChannel(result[ch], ch);
  }
  return outputBuffer;
}
