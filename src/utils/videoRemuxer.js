import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpeg;
let ffmpegLoaded = false;

async function getFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }
  if (!ffmpegLoaded) {
    await ffmpeg.load();
    ffmpegLoaded = true;
  }
  return ffmpeg;
}

/**
 * Release the FFmpeg WASM instance and free its memory.
 * Call this on app unmount.
 */
export function releaseFFmpeg() {
  if (ffmpeg && ffmpegLoaded) {
    try { ffmpeg.terminate(); } catch {}
    ffmpeg = null;
    ffmpegLoaded = false;
  }
}

/**
 * Remux a video file with a new audio track (in-browser, MP4 output).
 * The video stream is copied without re-encoding; only the audio is replaced.
 * @param {File|Blob} videoFile - The original video file (MP4)
 * @param {File|Blob} audioFile - The new audio file (WAV/MP3)
 * @returns {Promise<Blob>} - The remuxed MP4 file as a Blob
 */
export async function remuxVideoWithAudio(videoFile, audioFile) {
  const ff = await getFFmpeg();
  await ff.writeFile("input.mp4", new Uint8Array(await videoFile.arrayBuffer()));
  await ff.writeFile("input.wav", new Uint8Array(await audioFile.arrayBuffer()));
  await ff.exec([
    "-i", "input.mp4",
    "-i", "input.wav",
    "-c:v", "copy",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-shortest",
    "output.mp4",
  ]);
  const data = await ff.readFile("output.mp4");
  await ff.deleteFile("input.mp4");
  await ff.deleteFile("input.wav");
  await ff.deleteFile("output.mp4");
  return new Blob([data.buffer], { type: 'video/mp4' });
}
