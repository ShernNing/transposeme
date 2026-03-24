// Utility to remux a video file with a new audio track using ffmpeg.wasm.
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
 * Remux a video file with a new audio track (in-browser, MP4 output)
 * NOTE: The video stream is copied without re-encoding (-c:v copy), so the original video speed and quality are preserved.
 * Only the audio is replaced; video timing and playback speed remain unchanged.
 * @param {File|Blob} videoFile - The original video file (MP4)
 * @param {File|Blob} audioFile - The new audio file (WAV/MP3)
 * @returns {Promise<Blob>} - The remuxed MP4 file as a Blob
 */
export async function remuxVideoWithAudio(videoFile, audioFile) {
  const ffmpeg = await getFFmpeg();
  // Write input files to ffmpeg virtual FS.
  await ffmpeg.writeFile("input.mp4", new Uint8Array(await videoFile.arrayBuffer()));
  await ffmpeg.writeFile("input.wav", new Uint8Array(await audioFile.arrayBuffer()));

  // Replace audio while copying the original video stream.
  await ffmpeg.exec([
    "-i",
    "input.mp4",
    "-i",
    "input.wav",
    "-c:v",
    "copy",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-shortest",
    "output.mp4",
  ]);

  const data = await ffmpeg.readFile("output.mp4");
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("input.wav");
  await ffmpeg.deleteFile("output.mp4");
  return new Blob([data.buffer], { type: 'video/mp4' });
}
