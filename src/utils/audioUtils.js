// Placeholder for audio processing helpers
export function isAudio(file) {
  return file && file.type.startsWith('audio/');
}

// Convert AudioBuffer to a PCM 16-bit WAV Blob
export async function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length * numChannels * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);

  function writeString(v, offset, string) {
    for (let i = 0; i < string.length; i++) {
      v.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + audioBuffer.length * numChannels * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, audioBuffer.length * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = audioBuffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Extract duration/dimensions metadata from an audio or video Blob
export function extractMetadata(blob, type) {
  return new Promise((resolve) => {
    const TIMEOUT_MS = 8_000;
    if (type === "audio") {
      const audio = document.createElement("audio");
      const objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      const timer = setTimeout(() => { cleanup(); resolve({}); }, TIMEOUT_MS);
      audio.addEventListener("loadedmetadata", () => {
        clearTimeout(timer); cleanup();
        resolve({ duration: audio.duration, sampleRate: audio.mozSampleRate || undefined, channels: audio.mozChannels || undefined });
      }, { once: true });
      audio.addEventListener("error", () => { clearTimeout(timer); cleanup(); resolve({}); }, { once: true });
    } else if (type === "video") {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      const timer = setTimeout(() => { cleanup(); resolve({}); }, TIMEOUT_MS);
      video.addEventListener("loadedmetadata", () => {
        clearTimeout(timer); cleanup();
        resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timer); cleanup(); resolve({}); }, { once: true });
    } else {
      resolve({});
    }
  });
}
