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
import { saveProcessedItem, deleteProcessedItem, getAllProcessedItems, clearAllProcessedItems } from "./utils/db";


import Notice from "./components/Notice";
import YouTubeKeyAnalysis from "./components/YouTubeKeyAnalysis";
import KeySelector from "./components/KeySelector";
import YouTubePlayer from "./components/YouTubePlayer";
import PlayerSection from "./components/PlayerSection";
import ProcessedHistory from "./components/ProcessedHistory";
import "./App.css";

// --- Constants and Note Mappings ---
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


// --- Utility: Transpose a detected key label by semitones ---
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

// --- Main App Component ---
function App() {
    // --- State: Processed items history (persisted in IndexedDB) ---
    const [processedItems, setProcessedItems] = useState([]);

    // --- On mount: Load processed items from IndexedDB (and fallback to localStorage for legacy) ---
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const dbItems = await getAllProcessedItems();
          if (mounted && dbItems && dbItems.length > 0) {
            setProcessedItems(dbItems);
            localStorage.setItem("transpose_processedItems", JSON.stringify(dbItems));
          } else {
            // Fallback: load from localStorage if DB empty (legacy)
            const saved = localStorage.getItem("transpose_processedItems");
            if (saved) {
              const items = JSON.parse(saved);
              setProcessedItems(items);
            }
          }
        } catch {
          // fallback to localStorage
          const saved = localStorage.getItem("transpose_processedItems");
          if (saved) {
            const items = JSON.parse(saved);
            setProcessedItems(items);
          }
        }
      })();
      return () => { mounted = false; };
    }, []);

    // --- Helper: Add a processed item to history (max 10, no duplicates) ---
    // Always save to DB, and reload from DB after saving to ensure UI is in sync
    // Recursively remove non-serializable/circular properties from an object
    function toSerializable(obj, seen = new WeakSet()) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (seen.has(obj)) return undefined;
      seen.add(obj);
      if (obj instanceof Blob) return obj; // allow Blob for IndexedDB
      if (obj instanceof Date) return obj;
      if (Array.isArray(obj)) return obj.map(v => toSerializable(v, seen));
      if (
        obj instanceof HTMLElement ||
        obj instanceof EventTarget ||
        (obj.constructor && obj.constructor.name && obj.constructor.name.includes('FiberNode'))
      ) {
        return undefined;
      }
      const out = {};
      for (const k in obj) {
        const v = obj[k];
        if (typeof v === 'function') continue;
        const ser = toSerializable(v, seen);
        if (ser !== undefined) out[k] = ser;
      }
      return out;
    }

    const addProcessedItem = (item) => {
      const serializableItem = toSerializable(item);
      saveProcessedItem(serializableItem)
        .then(() => getAllProcessedItems())
        .then((dbItems) => {
          setProcessedItems(dbItems);
          localStorage.setItem("transpose_processedItems", JSON.stringify(dbItems));
        })
        .catch(() => {
          // fallback to localStorage logic
          setProcessedItems((prev) => {
            const exists = prev.some((x) => x.id === serializableItem.id);
            const next = exists ? prev : [serializableItem, ...prev];
            const trimmed = next.slice(0, 10);
            localStorage.setItem("transpose_processedItems", JSON.stringify(trimmed));
            return trimmed;
          });
        });
    };

    // --- Handler: Delete a processed item from history and DB ---
    const handleDeleteProcessed = (id) => {
      setProcessedItems((prev) => {
        const filtered = prev.filter((item) => item.id !== id);
        localStorage.setItem("transpose_processedItems", JSON.stringify(filtered));
        // Delete from IndexedDB
        deleteProcessedItem(id).catch(() => {});
        return filtered;
      });
    };

    // --- Helper: Fetch YouTube video title using oEmbed ---
    async function fetchYouTubeTitle(url) {
      try {
        const api = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const resp = await fetch(api);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.title || null;
      } catch {
        return null;
      }
    }

    // --- Helper: Extract metadata from audio/video blob ---
    const extractMetadata = async (blob, type) => {
      return new Promise((resolve) => {
        if (type === 'audio') {
          const audio = document.createElement('audio');
          audio.src = URL.createObjectURL(blob);
          audio.addEventListener('loadedmetadata', () => {
            resolve({
              duration: audio.duration,
              sampleRate: audio.mozSampleRate || undefined,
              channels: audio.mozChannels || undefined,
            });
            URL.revokeObjectURL(audio.src);
          });
        } else if (type === 'video') {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(blob);
          video.addEventListener('loadedmetadata', () => {
            resolve({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
            });
            URL.revokeObjectURL(video.src);
          });
        } else {
          resolve({});
        }
      });
    };

    // --- Handler: Instantly load and play a processed item from history ---
    const handleLoadProcessed = (item) => {
      // Always create a new object URL for the blob to avoid stale/revoked URLs
      if (item.blob) {
        setTransposedSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(item.blob);
        });
      } else {
        setTransposedSrc(item.src); // fallback for legacy items
      }
      setSemitones(item.semitones);
      setAppliedSemitones(item.semitones);
      setPendingSemitones(null);
      if (item.isYouTube) {
        setYoutubeUrl(item.youtubeUrl);
        setFile(null);
        setShowOriginalYouTube(false);
        if (item.metadata && item.metadata.key) {
          setYoutubeKey(item.metadata.key);
        } else {
          setYoutubeKey("");
          // Automatically trigger key analysis after a short delay
          setTimeout(() => {
            handleAnalyzeKey(item.youtubeUrl);
          }, 1000);
        }
      } else {
        setFile(null); // Always null to force reload
        setYoutubeUrl("");
        setShowOriginalYouTube(true);
        setYoutubeKey("");
      }
      // Delay playing until after src is set to ensure player reloads
      setTimeout(() => setPlaying(true), 0);
      showNotice("success", `Loaded from history: ${item.label}`);
    };
  // --- State: Main app state variables ---
  const { file, setFile, error: fileError } = useFileHandler();
  const { transpose, processing, error: transError } = useTransposer();
  const [appError, setAppError] = useState(""); // Error messages
  const [youtubeUrl, setYoutubeUrl] = useState(""); // Current YouTube URL
  const [semitones, setSemitones] = useState(0); // Current transpose value
  const [outputFormat, setOutputFormat] = useState(OUTPUT_FORMATS[0]); // Output format
  const [transposedSrc, setTransposedSrc] = useState(null); // Current transposed audio/video src
  const [playing, setPlaying] = useState(false); // Is player playing
  const [seekTo, setSeekTo] = useState(null); // Seek position
  const [progress, setProgress] = useState(0); // Progress bar
  const [useWasm, setUseWasm] = useState(true); // Toggle for in-browser transposition
  const [showOriginalYouTube, setShowOriginalYouTube] = useState(true); // Show original YouTube video
  const [isProcessingYouTube, setIsProcessingYouTube] = useState(false); // Is YouTube processing
  const [youtubeKey, setYoutubeKey] = useState(""); // Detected YouTube key
  const [isAnalyzingKey, setIsAnalyzingKey] = useState(false); // Is key being analyzed
  const [pendingSemitones, setPendingSemitones] = useState(null); // Pending transpose
  const [appliedSemitones, setAppliedSemitones] = useState(0); // Last applied transpose
  const [queuedDelta, setQueuedDelta] = useState(0); // Queued transpose delta
  const [processingDots, setProcessingDots] = useState("."); // Dots animation for processing
  const [keyAnalyzeDots, setKeyAnalyzeDots] = useState("."); // Dots animation for key analysis
  const [notice, setNotice] = useState(null); // Notice messages
  const youtubeTransposeAbortRef = useRef(null); // Abort controller for YouTube
  const youtubeDebounceTimerRef = useRef(null); // Debounce timer for YouTube
  const youtubeCacheRef = useRef(new Map()); // Cache for YouTube blobs
  const keyCacheRef = useRef(new Map()); // Cache for detected keys

  // --- Helper: Set transposedSrc from a Blob, revoking previous URL ---
  const setTransposedFromBlob = (blob) => {
    if (!blob) return;
    setTransposedSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  };

  // --- Helper: Show a notice message ---
  const showNotice = (type, message) => {
    setNotice({ type, message });
  };

  // --- Helper: Format semitone label for display ---
  const formatSemitoneLabel = (value) => {
    const prefix = value > 0 ? `+${value}` : `${value}`;
    return `${prefix} semitone${Math.abs(value) === 1 ? "" : "s"}`;
  };

  // --- Effects: Persist settings and animate dots ---
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

  // --- Helper: Pretty-print API error messages ---
  const prettyApiError = (fallbackMessage, payloadText = "") => {
    const text = (payloadText || "").toLowerCase();
    if (text.includes("proxy") || text.includes("403")) {
      return "Network/proxy blocked YouTube download. Please disable any proxy/VPN and try again. If the problem persists, check your firewall or browser extensions.";
    }
    if (text.includes("private video") || text.includes("video unavailable")) {
      return "This YouTube video is unavailable for download. It may be private, region-locked, or removed.";
    }
    if (text.includes("rate limit") || text.includes("too many requests")) {
      return "YouTube has temporarily rate-limited your requests. Please wait a minute and try again. If this happens repeatedly, try a different network or browser.";
    }
    if (text.includes("networkerror") || text.includes("failed to fetch")) {
      return "Network error: Unable to reach the server. Please check your internet connection and try again.";
    }
    if (text.includes("timeout")) {
      return "The request timed out. The server may be busy or your connection is slow. Please try again in a moment.";
    }
    if (text.includes("unsupported format") || text.includes("not supported")) {
      return "The selected file or video format is not supported. Please use a standard audio or video file, or a valid YouTube link.";
    }
    return fallbackMessage;
  };

  // --- Helper: Fetch transposed YouTube audio/video from backend ---
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
  // --- Handler: File upload and initial processing ---
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
      try {
        if (useWasm && isAudio(f)) {
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
          const meta = await extractMetadata(wavBlob, 'audio');
          addProcessedItem({
              id: `${f.name}::0`,
              type: 'audio',
              label: f.name,
              title: f.name,
              src: URL.createObjectURL(wavBlob),
              blob: wavBlob,
              semitones: 0,
              isYouTube: false,
              fileName: f.name,
              metadata: meta,
          });
        } else if (useWasm && isVideo(f)) {
          const arrayBuffer = await f.arrayBuffer();
          const audioCtx = new (
            window.AudioContext || window.webkitAudioContext
          )();
          let audioBuffer;
          try {
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          } catch (e) {
            setTransposedSrc(null);
            setAppError("Failed to decode audio from video file. The file may be corrupted or in an unsupported format. " + (e.message || ""));
            setProgress(0);
            return;
          }
          const transposedBuffer = await transposeAudioBuffer(audioBuffer, 0);
          const wavBlob = await audioBufferToWavBlob(transposedBuffer);
          setProgress(60);
          try {
            const remuxedBlob = await remuxVideoWithAudio(f, wavBlob);
            setTransposedFromBlob(remuxedBlob);
            setAppliedSemitones(0);
            setPlaying(true);
            const meta = await extractMetadata(remuxedBlob, 'video');
            addProcessedItem({
              id: `${f.name}::0`,
              type: 'video',
              label: f.name,
              title: f.name,
              src: URL.createObjectURL(remuxedBlob),
              blob: remuxedBlob,
              semitones: 0,
              isYouTube: false,
              fileName: f.name,
              metadata: meta,
            });
          } catch (e) {
            setTransposedSrc(null);
            setAppError("Video remuxing failed. This may be due to an unsupported video format or a browser limitation. " + (e.message || ""));
          }
        } else {
          const result = await transpose(f, 0, isAudio(f) ? "audio" : "video");
          if (result) {
            setTransposedFromBlob(result);
            setAppliedSemitones(0);
            setPlaying(true);
            const meta = await extractMetadata(result, isAudio(f) ? 'audio' : 'video');
            addProcessedItem({
              id: `${f.name}::0`,
              type: isAudio(f) ? 'audio' : 'video',
              label: f.name,
              title: f.name,
              src: URL.createObjectURL(result),
              blob: result,
              semitones: 0,
              isYouTube: false,
              fileName: f.name,
              metadata: meta,
            });
          }
        }
        setProgress(100);
      } catch (e) {
        setTransposedSrc(null);
        setAppError("File processing failed. Please check your file and try again. " + (e?.message || "Unknown error"));
        setProgress(0);
      }
    }
  };

  // Helper: Convert AudioBuffer to WAV Blob
  // --- Helper: Convert AudioBuffer to WAV Blob ---
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
  // --- Handler: Process YouTube input and extract/transcode ---
    const handleYouTube = async (url) => {
      // Always reset all relevant state before loading a new YouTube video
      setAppError("");
      setYoutubeUrl("");
      setFile(null);
      setShowOriginalYouTube(true);
      setYoutubeKey("");
      setSemitones(0);
      setPendingSemitones(null);
      setAppliedSemitones(0);
      setTransposedSrc(null);
      setProgress(0);
      setIsProcessingYouTube(false);
      setTimeout(async () => {
        setYoutubeUrl(url);
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
          const meta = await extractMetadata(blob, 'audio');
          let title = await fetchYouTubeTitle(url);
          // Always save the original YouTube item to DB and reload processedItems
          // Remove any non-serializable/circular properties before saving
          const serializableItem = {
            id: `${url}::0`,
            type: 'youtube',
            label: title || url,
            title: title || url,
            src: URL.createObjectURL(blob),
            blob: blob,
            semitones: 0,
            isYouTube: true,
            youtubeUrl: url,
            metadata: meta,
          };
          await saveProcessedItem(serializableItem);
          const dbItems = await getAllProcessedItems();
          setProcessedItems(dbItems);
          localStorage.setItem("transpose_processedItems", JSON.stringify(dbItems));
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
      }, 0);
      try {
        const blob = await fetchYouTubeTransposed(url, 0);
        setTransposedFromBlob(blob);
        setAppliedSemitones(0);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setShowOriginalYouTube(false);
        setPlaying(true);
        const meta = await extractMetadata(blob, 'audio');
        let title = await fetchYouTubeTitle(url);
        // Always save the original YouTube item to DB and reload processedItems
        // Remove any non-serializable/circular properties before saving
        const serializableItem = {
          id: `${url}::0`,
          type: 'youtube',
          label: title || url,
          title: title || url,
          src: URL.createObjectURL(blob),
          blob: blob,
          semitones: 0,
          isYouTube: true,
          youtubeUrl: url,
          metadata: meta,
        };
        await saveProcessedItem(serializableItem);
        const dbItems = await getAllProcessedItems();
        setProcessedItems(dbItems);
        localStorage.setItem("transpose_processedItems", JSON.stringify(dbItems));
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
  // --- Handler: Real-time transposition and playback ---
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
        // Save processed YouTube transposition to DB/history
        let title = await fetchYouTubeTitle(youtubeUrl);
        const meta = await extractMetadata(blob, 'audio');
        addProcessedItem({
          id: `${youtubeUrl}::${newSemitones}`,
          type: 'youtube',
          label: title || youtubeUrl,
          title: title || youtubeUrl,
          src: URL.createObjectURL(blob),
          blob: blob,
          semitones: newSemitones,
          isYouTube: true,
          youtubeUrl: youtubeUrl,
          metadata: meta,
        });
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

  // --- Handler: User changes transpose value ---
  const handleTranspose = (newSemitones) => {
    setSemitones(newSemitones);
    setPendingSemitones(newSemitones);
    setQueuedDelta(newSemitones - appliedSemitones);
    if (youtubeDebounceTimerRef.current) {
      clearTimeout(youtubeDebounceTimerRef.current);
    }
    // Only allow transpose if not processing
    if (youtubeUrl && !isProcessingYouTube) {
      youtubeDebounceTimerRef.current = setTimeout(() => {
        runTranspose(newSemitones);
      }, 250);
      return;
    }
    if (!isProcessingYouTube) {
      runTranspose(newSemitones);
    }
  };

  // --- Handler: Reset transpose to zero ---
  const handleResetTranspose = () => {
    handleTranspose(0);
  };

  // --- Handler: Analyze song key for YouTube (optionally with override URL) ---
  const handleAnalyzeKey = async (urlOverride) => {
    const url = urlOverride || youtubeUrl;
    if (!url) {
      setAppError("Load a YouTube URL first.");
      return;
    }
    if (isProcessingYouTube) {
      setAppError("Wait for YouTube processing to finish before analyzing key.");
      return;
    }
    setAppError("");
    setIsAnalyzingKey(true);
    try {
      if (keyCacheRef.current.has(url)) {
        setYoutubeKey(keyCacheRef.current.get(url));
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/youtube-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(prettyApiError("Failed to analyze song key.", errText));
      }
      const data = await response.json();
      const detected = data?.key || "Unknown";
      keyCacheRef.current.set(url, detected);
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
  // Compose keyFeedback as a styled React element
  let keyFeedback = null;
  if (isAnalyzingKey) {
    keyFeedback = (
      <span style={{ color: "#f6e05e" }}>Analyzing key from audio...</span>
    );
  } else if ((isProcessingYouTube || processing) && pendingSemitones !== null) {
    const feedbackText = `Applying ${formatSemitoneLabel(pendingSemitones)}${processingDots}`;
    const queuedText = queuedDelta !== 0 ? `Queued: ${queuedDelta > 0 ? "+" : ""}${queuedDelta} (latest)` : null;
    keyFeedback = (
      <>
        <div style={{ color: "#f6e05e" }}>{feedbackText}</div>
        {queuedText && (
          <div style={{ color: "#f6ad55", fontSize: 12, marginTop: 2 }}>{queuedText}</div>
        )}
      </>
    );
  } else if (youtubeKey) {
    keyFeedback = (
      <span style={{ color: "#9ae6b4" }}>Applied {formatSemitoneLabel(appliedSemitones)}</span>
    );
  } else {
    keyFeedback = (
      <span style={{ color: "#9ae6b4" }}>Key not analyzed yet.</span>
    );
  }

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

  // Handler: Clear all processed items from DB and update state
  const handleClearProcessed = async () => {
    await clearAllProcessedItems();
    setProcessedItems([]);
  };

  return (
    <div className='App'>
      <main className="app-shell">
        <h1 className="app-title">Transpose App</h1>
        <div className="app-card">
          <ProcessedHistory processedItems={processedItems} onLoad={handleLoadProcessed} onDelete={handleDeleteProcessed} onClear={handleClearProcessed} onRefresh={async () => {
            const dbItems = await getAllProcessedItems();
            setProcessedItems(dbItems);
          }} />

          {(processing || isProcessingYouTube || ((file || youtubeUrl) && progress < 100)) && (
            <ProgressBar
              progress={progress}
              label={
                (processing || isProcessingYouTube || ((file || youtubeUrl) && progress < 100))
                  ? "Processing transposed audio..."
                  : ""
              }
            />
          )}

          <YouTubeInput onSubmit={handleYouTube} disabled={processing || isProcessingYouTube} />
          <PlayerSection
            file={file}
            youtubeUrl={youtubeUrl}
            transposedSrc={transposedSrc}
            playing={playing}
            setPlaying={setPlaying}
            processing={processing}
            isProcessingYouTube={isProcessingYouTube}
            seekTo={seekTo}
            semitones={semitones}
            appliedSemitones={appliedSemitones}
            isAudio={isAudio}
            isVideo={isVideo}
            AudioPlayer={AudioPlayer}
            VideoPlayer={VideoPlayer}
            processedItems={processedItems}
            controlsDisabled={processing || isProcessingYouTube}
          />

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

                  <YouTubeKeyAnalysis
                youtubeUrl={youtubeUrl}
                isAnalyzingKey={isAnalyzingKey}
                isProcessingYouTube={isProcessingYouTube}
                handleAnalyzeKey={handleAnalyzeKey}
                keyFeedback={keyFeedback}
                keyAnalyzeDots={keyAnalyzeDots}
                youtubeKey={youtubeKey}
              >
                <KeySelector
                  youtubeKey={youtubeKey}
                  appliedSemitones={appliedSemitones}
                  processing={processing}
                  isProcessingYouTube={isProcessingYouTube}
                  handleTranspose={handleTranspose}
                  CHROMATIC_NOTES={CHROMATIC_NOTES}
                  CHROMATIC_NOTES_FLAT={CHROMATIC_NOTES_FLAT}
                  NOTE_TO_INDEX={NOTE_TO_INDEX}
                  processedItems={processedItems}
                  youtubeUrl={youtubeUrl}
                />
              </YouTubeKeyAnalysis>

              {(file || youtubeUrl) && (
                <TransposeControls
                  value={semitones}
                  min={-12}
                  max={12}
                  onChange={handleTranspose}
                  onReset={handleResetTranspose}
                  disabled={processing || isProcessingYouTube}
                />
              )}
          <Notice notice={notice} />
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
              <YouTubePlayer url={youtubeUrl} show={showOriginalYouTube} />
       
              <DownloadShare
                onDownload={handleDownload}
                onShare={handleShare}
                disabled={!transposedSrc || processing || isProcessingYouTube}
                formats={OUTPUT_FORMATS}
                selectedFormat={outputFormat}
                onFormatChange={setOutputFormat}
              />
            </>
          )}
           <FileUpload onFileSelect={handleFileSelect} disabled={processing || isProcessingYouTube} />
          <FAQ />
        </div>
      </main>
    </div>
  );
}

export default App;
