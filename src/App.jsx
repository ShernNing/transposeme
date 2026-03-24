import React, { useEffect, useRef, useState } from "react";
import { transposeAudioBuffer } from "./utils/wasmTransposer";
import FileUpload from "./components/FileUpload";
import YouTubeInput from "./components/YouTubeInput";
import TransposeControls from "./components/TransposeControls";
import AudioPlayer from "./components/AudioPlayer";
import VideoPlayer from "./components/VideoPlayer";
import DownloadShare from "./components/DownloadShare";
import ProgressBar from "./components/ProgressBar";
import ErrorDisplay from "./components/ErrorDisplay";
import FAQ from "./components/FAQ";
import useFileHandler from "./hooks/useFileHandler";
import useTransposer from "./hooks/useTransposer";
import { isAudio } from "./utils/audioUtils";
import { isVideo } from "./utils/videoUtils";
import { remuxVideoWithAudio } from "./utils/videoRemuxer";
import "./App.css";

const OUTPUT_FORMATS = ["mp3", "mp4"];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHROMATIC_NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_TO_INDEX = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

function getYouTubeVideoId(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/shorts/")[1]?.split("/")[0] || "";
    }
    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function transposeDetectedKey(keyLabel, semitoneShift) {
  if (!keyLabel) return "";
  const trimmed = keyLabel.trim();
  const [root, ...rest] = trimmed.split(/\s+/);
  const quality = rest.join(" ");
  const prefersFlat = root.includes("b");
  const idx = NOTE_TO_INDEX[root];
  if (idx == null) return trimmed;
  const nextIdx = (idx + semitoneShift + 120) % 12;
  const nextRoot = prefersFlat ? CHROMATIC_NOTES_FLAT[nextIdx] : CHROMATIC_NOTES[nextIdx];
  return quality ? `${nextRoot} ${quality}` : nextRoot;
}

function App() {
  const { file, setFile, error: fileError } = useFileHandler();
  const { transpose, processing, error: transError } = useTransposer();
  const [appError, setAppError] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [semitones, setSemitones] = useState(0);
  const [outputFormat, setOutputFormat] = useState(OUTPUT_FORMATS[0]);
  const [transposedSrc, setTransposedSrc] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [seekTo, setSeekTo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [useWasm, setUseWasm] = useState(true); // Toggle for in-browser transposition
  const [showOriginalYouTube, setShowOriginalYouTube] = useState(true);
  const [isProcessingYouTube, setIsProcessingYouTube] = useState(false);
  const [youtubeKey, setYoutubeKey] = useState("");
  const [isAnalyzingKey, setIsAnalyzingKey] = useState(false);
  const [pendingSemitones, setPendingSemitones] = useState(null);
  const [appliedSemitones, setAppliedSemitones] = useState(0);
  const [queuedDelta, setQueuedDelta] = useState(0);
  const [processingDots, setProcessingDots] = useState(".");
  const [keyAnalyzeDots, setKeyAnalyzeDots] = useState(".");
  const [notice, setNotice] = useState(null);
  const youtubeTransposeAbortRef = useRef(null);
  const youtubeDebounceTimerRef = useRef(null);
  const youtubeCacheRef = useRef(new Map());
  const keyCacheRef = useRef(new Map());

  const setTransposedFromBlob = (blob) => {
    if (!blob) return;
    setTransposedSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  };

  const showNotice = (type, message) => {
    setNotice({ type, message });
  };

  const formatSemitoneLabel = (value) => {
    const prefix = value > 0 ? `+${value}` : `${value}`;
    return `${prefix} semitone${Math.abs(value) === 1 ? "" : "s"}`;
  };

  useEffect(() => {
    const savedUseWasm = localStorage.getItem("transpose_useWasm");
    const savedFormat = localStorage.getItem("transpose_outputFormat");
    if (savedUseWasm != null) setUseWasm(savedUseWasm === "true");
    if (savedFormat && OUTPUT_FORMATS.includes(savedFormat)) setOutputFormat(savedFormat);
  }, []);

  useEffect(() => {
    localStorage.setItem("transpose_useWasm", String(useWasm));
  }, [useWasm]);

  useEffect(() => {
    localStorage.setItem("transpose_outputFormat", outputFormat);
  }, [outputFormat]);

  useEffect(() => {
    if (!(isProcessingYouTube || processing)) {
      setProcessingDots(".");
      return;
    }
    const frames = [".", "..", "..."];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % frames.length;
      setProcessingDots(frames[i]);
    }, 350);
    return () => clearInterval(timer);
  }, [isProcessingYouTube, processing]);

  useEffect(() => {
    if (!isAnalyzingKey) {
      setKeyAnalyzeDots(".");
      return;
    }
    const frames = [".", "..", "..."];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % frames.length;
      setKeyAnalyzeDots(frames[i]);
    }, 350);
    return () => clearInterval(timer);
  }, [isAnalyzingKey]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      if (youtubeTransposeAbortRef.current) youtubeTransposeAbortRef.current.abort();
      if (youtubeDebounceTimerRef.current) clearTimeout(youtubeDebounceTimerRef.current);
      if (transposedSrc) URL.revokeObjectURL(transposedSrc);
    };
  }, [transposedSrc]);

  const prettyApiError = (fallbackMessage, payloadText = "") => {
    const text = (payloadText || "").toLowerCase();
    if (text.includes("proxy") || text.includes("403")) {
      return "Network/proxy blocked YouTube download. Disable proxy/VPN and try again.";
    }
    if (text.includes("private video") || text.includes("video unavailable")) {
      return "This YouTube video is unavailable for download.";
    }
    if (text.includes("rate limit") || text.includes("too many requests")) {
      return "Rate limited by YouTube. Wait a minute and try again.";
    }
    return fallbackMessage;
  };

  const fetchYouTubeTransposed = async (url, newSemitones) => {
    const cacheKey = `${url}::${newSemitones}`;
    if (youtubeCacheRef.current.has(cacheKey)) {
      return youtubeCacheRef.current.get(cacheKey);
    }
    if (youtubeTransposeAbortRef.current) youtubeTransposeAbortRef.current.abort();
    const controller = new AbortController();
    youtubeTransposeAbortRef.current = controller;
    const response = await fetch(`${API_BASE_URL}/api/youtube-transpose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, semitones: newSemitones }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(prettyApiError("Failed to process YouTube link.", errText));
    }
    const blob = await response.blob();
    youtubeCacheRef.current.set(cacheKey, blob);
    return blob;
  };

  // Automatically process and play file or YouTube link on load
  const handleFileSelect = async (f) => {
    setAppError("");
    setFile(f);
    setYoutubeUrl("");
    setShowOriginalYouTube(true);
    setYoutubeKey("");
    setSemitones(0);
    setPendingSemitones(null);
    setAppliedSemitones(0);
    setTransposedSrc(null);
    if (f) {
      setProgress(10);
      if (useWasm && isAudio(f)) {
        // In-browser WASM transposition for audio files
        const arrayBuffer = await f.arrayBuffer();
        const audioCtx = new (
          window.AudioContext || window.webkitAudioContext
        )();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const transposedBuffer = await transposeAudioBuffer(audioBuffer, 0);
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        setTransposedFromBlob(wavBlob);
        setAppliedSemitones(0);
        setPlaying(true);
      } else if (useWasm && isVideo(f)) {
        // In-browser WASM transposition for video files (remux with ffmpeg.wasm)
        // 1. Extract audio from video
        const arrayBuffer = await f.arrayBuffer();
        const audioCtx = new (
          window.AudioContext || window.webkitAudioContext
        )();
        // Decode audio from video file
        let audioBuffer;
        try {
          audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
          setTransposedSrc(null);
          setAppError("Failed to decode audio from video file: " + e.message);
          setProgress(0);
          return;
        }
        // 2. Transpose audio
        const transposedBuffer = await transposeAudioBuffer(audioBuffer, 0);
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        // 3. Remux video with new audio
        setProgress(60);
        try {
          const remuxedBlob = await remuxVideoWithAudio(f, wavBlob);
          setTransposedFromBlob(remuxedBlob);
          setAppliedSemitones(0);
          setPlaying(true);
        } catch (e) {
          setTransposedSrc(null);
          setAppError("Video remuxing failed: " + e.message);
        }
      } else {
        const result = await transpose(f, 0, isAudio(f) ? "audio" : "video");
        if (result) {
          setTransposedFromBlob(result);
          setAppliedSemitones(0);
          setPlaying(true);
        }
      }
      setProgress(100);
    }
  };

  // Helper: Convert AudioBuffer to WAV Blob
  async function audioBufferToWavBlob(audioBuffer) {
    // PCM 16-bit WAV encoding
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numChannels * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    // WAV header
    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
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
    // PCM samples
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = audioBuffer.getChannelData(ch)[i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true,
        );
        offset += 2;
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  // Handle YouTube input: call backend API to extract and transpose audio
  const handleYouTube = async (url) => {
    setAppError("");
    setYoutubeUrl(url);
    setFile(null);
    setShowOriginalYouTube(true);
    setYoutubeKey("");
    setSemitones(0);
    setPendingSemitones(0);
    setAppliedSemitones(0);
    setTransposedSrc(null);
    setProgress(10);
    setIsProcessingYouTube(true);
    try {
      const blob = await fetchYouTubeTransposed(url, 0);
      setTransposedFromBlob(blob);
      setAppliedSemitones(0);
      setPendingSemitones(null);
      setQueuedDelta(0);
      setShowOriginalYouTube(false);
      setPlaying(true);
      // Auto-detect original key so key labels are always populated.
      if (keyCacheRef.current.has(url)) {
        setYoutubeKey(keyCacheRef.current.get(url));
      } else {
        setIsAnalyzingKey(true);
        try {
          const keyResp = await fetch(`${API_BASE_URL}/api/youtube-key`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          if (keyResp.ok) {
            const keyData = await keyResp.json();
            const detected = keyData?.key || "Unknown";
            keyCacheRef.current.set(url, detected);
            setYoutubeKey(detected);
          }
        } finally {
          setIsAnalyzingKey(false);
        }
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setTransposedSrc(null);
      setAppError("YouTube processing failed: " + (e?.message || "Unknown error"));
    } finally {
      setIsProcessingYouTube(false);
    }
    setProgress(100);
  };

  // Real-time transposition and playback

  // Real-time transposition and playback, including YouTube
  const runTranspose = async (newSemitones) => {
    setAppError("");
    // Save playback position if possible
    let currentTime = 0;
    const audio = document.querySelector("audio");
    const video = document.querySelector("video");
    if (audio && !audio.paused) currentTime = audio.currentTime;
    if (video && !video.paused) currentTime = video.currentTime;

    setProgress(10);
    if (youtubeUrl) {
      setIsProcessingYouTube(true);
      try {
        const blob = await fetchYouTubeTransposed(youtubeUrl, newSemitones);
        setTransposedFromBlob(blob);
        setAppliedSemitones(newSemitones);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setShowOriginalYouTube(false);
        setSeekTo(currentTime);
        setPlaying(true);
      } catch (e) {
        if (e.name === "AbortError") return;
        setTransposedSrc(null);
        setAppError("YouTube processing failed: " + (e?.message || "Unknown error"));
      } finally {
        setIsProcessingYouTube(false);
      }
      setProgress(100);
      return;
    }
    let input = file;
    if (!input) {
      setAppError("Choose a file or YouTube link first.");
      return;
    }
    setProgress(50);
    try {
      if (useWasm && isAudio(input)) {
        // In-browser WASM transposition for audio files
        const arrayBuffer = await input.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const transposedBuffer = await transposeAudioBuffer(
          audioBuffer,
          newSemitones,
        );
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        setTransposedFromBlob(wavBlob);
        setAppliedSemitones(newSemitones);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setSeekTo(currentTime);
        setPlaying(true);
      } else if (useWasm && isVideo(input)) {
        // In-browser WASM transposition for video files (remux with ffmpeg.wasm)
        const arrayBuffer = await input.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const transposedBuffer = await transposeAudioBuffer(
          audioBuffer,
          newSemitones,
        );
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        setProgress(80);
        const remuxedBlob = await remuxVideoWithAudio(input, wavBlob);
        setTransposedFromBlob(remuxedBlob);
        setAppliedSemitones(newSemitones);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setSeekTo(currentTime);
        setPlaying(true);
      } else {
        const result = await transpose(
          input,
          newSemitones,
          isAudio(input) ? "audio" : "video",
        );
        if (result) {
          setTransposedFromBlob(result);
          setAppliedSemitones(newSemitones);
          setPendingSemitones(null);
          setQueuedDelta(0);
          setSeekTo(currentTime);
          setPlaying(true);
        }
      }
    } catch (e) {
      setTransposedSrc(null);
      setAppError("Transposition failed: " + (e?.message || "Unknown error"));
      setProgress(0);
      return;
    }
    setProgress(100);
  };

  const handleTranspose = (newSemitones) => {
    setSemitones(newSemitones);
    setPendingSemitones(newSemitones);
    setQueuedDelta(newSemitones - appliedSemitones);
    if (youtubeDebounceTimerRef.current) {
      clearTimeout(youtubeDebounceTimerRef.current);
    }
    if (youtubeUrl) {
      youtubeDebounceTimerRef.current = setTimeout(() => {
        runTranspose(newSemitones);
      }, 250);
      return;
    }
    runTranspose(newSemitones);
  };

  const handleResetTranspose = () => {
    handleTranspose(0);
  };

  const handleAnalyzeKey = async () => {
    if (!youtubeUrl) {
      setAppError("Load a YouTube URL first.");
      return;
    }
    setAppError("");
    setIsAnalyzingKey(true);
    try {
      if (keyCacheRef.current.has(youtubeUrl)) {
        setYoutubeKey(keyCacheRef.current.get(youtubeUrl));
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/youtube-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(prettyApiError("Failed to analyze song key.", errText));
      }
      const data = await response.json();
      const detected = data?.key || "Unknown";
      keyCacheRef.current.set(youtubeUrl, detected);
      setYoutubeKey(detected);
    } catch (e) {
      setAppError("Key analysis failed: " + (e?.message || "Unknown error"));
    } finally {
      setIsAnalyzingKey(false);
    }
  };

  const originalKeyLabel = youtubeKey || "Unknown";
  const currentKeyLabel = youtubeKey
    ? transposeDetectedKey(youtubeKey, appliedSemitones)
    : "Unknown";
  const keyFeedback = isAnalyzingKey
    ? "Analyzing key from audio..."
    : youtubeKey
      ? "Key analysis complete."
      : "Key not analyzed yet.";

  // Download/share handlers (placeholders)
  const handleDownload = () => {
    if (!transposedSrc) {
      setAppError("No transposed output to download yet.");
      return;
    }
    const a = document.createElement("a");
    a.href = transposedSrc;
    a.download = `transposed.${outputFormat}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotice("success", `Downloaded transposed.${outputFormat}`);
  };
  const handleShare = () => {
    if (navigator.share && transposedSrc) {
      navigator.share({ url: transposedSrc });
      showNotice("success", "Share sheet opened.");
    } else {
      setAppError("Sharing is not supported on this device/browser.");
    }
  };

  // Runtime safeguard: Ensure playbackRate is always 1.0
  React.useEffect(() => {
    const checkPlaybackRate = () => {
      const audio = document.querySelector("audio");
      const video = document.querySelector("video");
      if (audio && audio.playbackRate !== 1.0) {
        console.warn("Audio playbackRate was not 1.0, resetting.");
        audio.playbackRate = 1.0;
      }
      if (video && video.playbackRate !== 1.0) {
        console.warn("Video playbackRate was not 1.0, resetting.");
        video.playbackRate = 1.0;
      }
    };
    checkPlaybackRate();
    const interval = setInterval(checkPlaybackRate, 1000);
    return () => clearInterval(interval);
  }, [transposedSrc, file, youtubeUrl]);

  return (
    <div className='App'>
      <main className="app-shell">
        <h1 className="app-title">Transpose App</h1>
      <div className="app-card">
        <FileUpload onFileSelect={handleFileSelect} disabled={processing || isProcessingYouTube} />
        <YouTubeInput onSubmit={handleYouTube} disabled={processing || isProcessingYouTube} />
        {notice && (
          <div
            style={{
              margin: "8px 0 10px",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 13,
              background: notice.type === "success" ? "#1f3b2b" : "#2d3748",
              border: `1px solid ${notice.type === "success" ? "#38a169" : "#4a5568"}`,
              color: notice.type === "success" ? "#9ae6b4" : "#e2e8f0",
            }}
          >
            {notice.message}
          </div>
        )}
        <ErrorDisplay error={appError || fileError || transError} />
        {(file || youtubeUrl) && (
          <>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <label style={{ color: "#fff", marginRight: 8 }}>
                <input
                  type='checkbox'
                  checked={useWasm}
                  onChange={(e) => setUseWasm(e.target.checked)}
                  disabled={processing}
                  style={{ marginRight: 4 }}
                />
                Use in-browser (WASM) transposition
              </label>
            </div>
            <TransposeControls
              value={semitones}
              min={-12}
              max={12}
              onChange={handleTranspose}
              onReset={handleResetTranspose}
              disabled={processing || isProcessingYouTube}
            />
            {(pendingSemitones !== null || transposedSrc) && (
              <div style={{ textAlign: "center", marginBottom: 8, fontSize: 13 }}>
                {(isProcessingYouTube || processing) && pendingSemitones !== null ? (
                  <>
                    <div style={{ color: "#f6e05e" }}>
                      Applying {formatSemitoneLabel(pendingSemitones)}
                      {processingDots}
                    </div>
                    {queuedDelta !== 0 && (
                      <div style={{ color: "#f6ad55", fontSize: 12, marginTop: 2 }}>
                        Queued: {queuedDelta > 0 ? "+" : ""}
                        {queuedDelta} (latest)
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ color: "#9ae6b4" }}>
                    Applied {formatSemitoneLabel(appliedSemitones)}
                  </span>
                )}
              </div>
            )}
            {youtubeUrl && (
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <button
                  onClick={handleAnalyzeKey}
                  disabled={isAnalyzingKey || isProcessingYouTube}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "none",
                    background: "#2d3748",
                    color: "#fff",
                  }}
                >
                  {isAnalyzingKey ? "Analyzing key..." : "Analyze song key"}
                </button>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: isAnalyzingKey ? "#f6e05e" : youtubeKey ? "#9ae6b4" : "#a0aec0",
                  }}
                >
                  {keyFeedback}
                </div>
                {isAnalyzingKey && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "#3b3415",
                      border: "1px solid #d69e2e",
                      color: "#f6e05e",
                      fontSize: 12,
                      display: "inline-block",
                    }}
                  >
                    Analyzing song key{keyAnalyzeDots}
                  </div>
                )}
                {/* Key Selector: show after key analysis, support major/minor */}
                {!isAnalyzingKey && youtubeKey && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: "#9ae6b4", fontWeight: 600, marginBottom: 4 }}>
                      Select a key to transpose:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
                      {["major", "minor"].map((mode) => (
                        <div key={mode} style={{ margin: "0 8px" }}>
                          <div style={{ color: "#a0aec0", fontSize: 12, marginBottom: 2, textAlign: "center" }}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</div>
                          {CHROMATIC_NOTES.map((note, i) => {
                            // Compose key label (e.g. C major, C# minor)
                            const keyLabel = `${note} ${mode}`;
                            // If original key is flat, show flats for selector
                            const prefersFlat = youtubeKey.includes("b");
                            const noteName = prefersFlat ? CHROMATIC_NOTES_FLAT[i] : note;
                            const label = `${noteName} ${mode}`;
                            // Compute semitone shift from detected key to this key
                            const [origRoot, ...origRest] = youtubeKey.trim().split(/\s+/);
                            const origMode = (origRest.join(" ").toLowerCase().includes("minor")) ? "minor" : "major";
                            const origIdx = NOTE_TO_INDEX[origRoot];
                            const targetIdx = NOTE_TO_INDEX[note];
                            let shift = null;
                            if (origIdx != null && targetIdx != null) {
                              // Only allow mode match (major->major, minor->minor)
                              if (origMode === mode) {
                                shift = (targetIdx - origIdx + 12) % 12;
                                // If shift > 6, prefer negative direction for musical sense
                                if (shift > 6) shift -= 12;
                              }
                            }
                            const isCurrent = shift !== null && shift === appliedSemitones && origMode === mode;
                            return (
                              <button
                                key={label}
                                disabled={shift === null || processing || isProcessingYouTube}
                                style={{
                                  margin: 2,
                                  padding: "4px 10px",
                                  borderRadius: 4,
                                  border: isCurrent ? "2px solid #38a169" : "1px solid #4a5568",
                                  background: isCurrent ? "#22543d" : "#2d3748",
                                  color: isCurrent ? "#9ae6b4" : "#e2e8f0",
                                  fontWeight: isCurrent ? 700 : 400,
                                  opacity: shift === null ? 0.4 : 1,
                                  cursor: shift === null ? "not-allowed" : "pointer",
                                  minWidth: 38,
                                }}
                                onClick={() => {
                                  if (shift !== null) handleTranspose(shift);
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div style={{ color: "#a0aec0", fontSize: 11, marginTop: 4 }}>
                      Only keys matching the original mode are enabled.
                    </div>
                  </div>
                )}
              </div>
            )}
            {youtubeUrl && (
              <div
                style={{
                  textAlign: "center",
                  marginBottom: 8,
                  fontSize: 13,
                  color: "#cbd5e0",
                }}
              >
                <span style={{ marginRight: 12 }}>
                  Original key: <span style={{ color: "#90cdf4" }}>{originalKeyLabel}</span>
                </span>
                <span>
                  Current key: <span style={{ color: "#9ae6b4" }}>{currentKeyLabel}</span>
                </span>
              </div>
            )}
            <ProgressBar
              progress={progress}
              label={
                processing || isProcessingYouTube || progress < 100
                  ? "Processing transposed audio..."
                  : ""
              }
            />
            {youtubeUrl && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "#a0aec0",
                  marginTop: 2,
                  marginBottom: 8,
                }}
              >
                {isProcessingYouTube
                  ? "Fetching YouTube audio and applying pitch shift. This can take 10-60 seconds."
                  : "Tip: use +/- for quick transpose previews; latest request is applied."}
              </div>
            )}
            {/* Show YouTube player if a YouTube URL is present */}
            {youtubeUrl && showOriginalYouTube && (
              <div style={{ margin: "16px 0" }}>
                <div
                  style={{
                    position: "relative",
                    paddingBottom: "56.25%",
                    height: 0,
                    overflow: "hidden",
                    borderRadius: 8,
                    background: "#000",
                  }}
                >
                  <iframe
                    title='YouTube Player'
                    src={`https://www.youtube.com/embed/${getYouTubeVideoId(youtubeUrl)}?autoplay=0&mute=1`}
                    frameBorder='0'
                    allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                    allowFullScreen
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                    }}
                  />
                </div>
                <div
                  style={{
                    textAlign: "center",
                    color: "#aaa",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Original YouTube video (before transposition)
                </div>
              </div>
            )}
            {file && isAudio(file) && (
              <AudioPlayer
                src={transposedSrc}
                playing={playing}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                disabled={processing || isProcessingYouTube}
                seekTo={seekTo}
              />
            )}
            {file && isVideo(file) && (
              <VideoPlayer
                src={transposedSrc}
                playing={playing}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                disabled={processing || isProcessingYouTube}
                seekTo={seekTo}
              />
            )}
            {/* Show transposed audio player for YouTube audio result */}
            {youtubeUrl && transposedSrc && (
              <>
                <div
                  style={{
                    textAlign: "center",
                    color: "#9ae6b4",
                    fontSize: 13,
                    marginTop: 8,
                    marginBottom: 4,
                  }}
                >
                  Transposed playback: {semitones > 0 ? `+${semitones}` : semitones} semitone
                  {Math.abs(semitones) === 1 ? "" : "s"}
                </div>
                <AudioPlayer
                  src={transposedSrc}
                  playing={playing}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  disabled={processing || isProcessingYouTube}
                  seekTo={seekTo}
                />
              </>
            )}
            <DownloadShare
              onDownload={handleDownload}
              onShare={handleShare}
              disabled={!transposedSrc}
              formats={OUTPUT_FORMATS}
              selectedFormat={outputFormat}
              onFormatChange={setOutputFormat}
            />
          </>
        )}
        <FAQ />
      </div>
      </main>
    </div>
  );
}

export default App;
