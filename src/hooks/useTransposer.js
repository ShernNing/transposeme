// Placeholder for audio/video transposition logic using Rubber Band WASM or SoundTouchJS

import { useState, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";

export default function useTransposer() {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Fallback hook path for non-WASM mode in App.
  // Real pitch-shifting is handled by the App's in-browser WASM path.
  const transposeAudioBuffer = async (arrayBuffer, semitones) => {
    if (semitones !== 0) {
      setError(
        "Non-WASM transpose is not implemented yet. Enable in-browser (WASM) transposition.",
      );
      return null;
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  };

  // Helper: Extract audio from video using ffmpeg.wasm
  const extractAudioFromVideo = async (file) => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    const arrayBuffer = await file.arrayBuffer();
    await ffmpeg.writeFile("input.mp4", new Uint8Array(arrayBuffer));
    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "44100",
      "-ac",
      "2",
      "output.wav",
    ]);
    const data = await ffmpeg.readFile("output.wav");
    return new Blob([data.buffer], { type: "audio/wav" });
  };

  const transpose = useCallback(async (fileOrBuffer, semitones, type) => {
    setProcessing(true);
    setError(null);
    try {
      let audioBlob = null;
      if (type === "audio") {
        const arrayBuffer = await fileOrBuffer.arrayBuffer();
        audioBlob = await transposeAudioBuffer(arrayBuffer, semitones);
      } else if (type === "video") {
        // Extract audio, transpose, then (optionally) remux
        const audio = await extractAudioFromVideo(fileOrBuffer);
        const arrayBuffer = await audio.arrayBuffer();
        audioBlob = await transposeAudioBuffer(arrayBuffer, semitones);
        // For MVP: return audio only; remuxing to video is complex
      }
      return audioBlob;
    } catch {
      setError("Transposition failed.");
      return null;
    } finally {
      setProcessing(false);
    }
  }, []);

  return { transpose, processing, error };
}
