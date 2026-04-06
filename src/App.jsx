import React, { useEffect, useRef, useState, useCallback } from "react";
import { transposeAudioBuffer } from "./utils/wasmTransposer";
import FileUpload from "./components/FileUpload";
import YouTubeInput from "./components/YouTubeInput";
import TransposeControls from "./components/TransposeControls";
import AudioPlayer from "./components/AudioPlayer";
import VideoPlayer from "./components/VideoPlayer";
import DownloadShare from "./components/DownloadShare";
import ErrorDisplay from "./components/ErrorDisplay";
import FAQ from "./components/FAQ";
import Notice from "./components/Notice";
import YouTubeKeyAnalysis from "./components/YouTubeKeyAnalysis";
import KeySelector from "./components/KeySelector";
import YouTubePlayer from "./components/YouTubePlayer";
import PlayerSection from "./components/PlayerSection";
import ProcessedHistory from "./components/ProcessedHistory";
import ChordSheet from "./components/ChordSheet";
import ChordDocGenerator from "./components/ChordDocGenerator";

import useFileHandler from "./hooks/useFileHandler";
import useTransposer from "./hooks/useTransposer";
import useAudioContext from "./hooks/useAudioContext";
import useProcessedHistory from "./hooks/useProcessedHistory";
import useYouTubeTranspose from "./hooks/useYouTubeTranspose";

import { isAudio } from "./utils/audioUtils";
import { audioBufferToWavBlob, extractMetadata } from "./utils/audioUtils";
import { isVideo } from "./utils/videoUtils";
import { remuxVideoWithAudio, releaseFFmpeg } from "./utils/videoRemuxer";
import { CHROMATIC_NOTES, CHROMATIC_NOTES_FLAT, NOTE_TO_INDEX } from "./utils/constants";
import { CONFIG } from "./utils/config";
import "./App.css";

const OUTPUT_FORMATS = ["mp3", "mp4"];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Transpose a detected key label by semitones
function transposeDetectedKey(keyLabel, semitoneShift) {
  if (!keyLabel) return "";
  const [root, ...rest] = keyLabel.trim().split(/\s+/);
  const quality = rest.join(" ");
  const prefersFlat = root.includes("b");
  const idx = NOTE_TO_INDEX[root];
  if (idx == null) return keyLabel.trim();
  const nextIdx = (idx + semitoneShift + 120) % 12;
  const nextRoot = prefersFlat ? CHROMATIC_NOTES_FLAT[nextIdx] : CHROMATIC_NOTES[nextIdx];
  return quality ? `${nextRoot} ${quality}` : nextRoot;
}

function App() {
  // --- Core state ---
  const [appError, setAppError] = useState("");
  const [semitones, setSemitones] = useState(0);
  const [outputFormat, setOutputFormat] = useState(OUTPUT_FORMATS[0]);
  const [transposedSrc, setTransposedSrc] = useState(null);
  const [originalSrc, setOriginalSrc] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [seekTo, setSeekTo] = useState(null);
  const [useWasm, setUseWasm] = useState(true);
  const [showOriginalYouTube, setShowOriginalYouTube] = useState(true);
  const [appliedSemitones, setAppliedSemitones] = useState(0);
  const [pendingSemitones, setPendingSemitones] = useState(null);
  const [queuedDelta, setQueuedDelta] = useState(0);
  const [processingDots, setProcessingDots] = useState(".");
  const [keyAnalyzeDots, setKeyAnalyzeDots] = useState(".");
  const [notice, setNotice] = useState(null);
  const [tempoMode, setTempoMode] = useState(false);
  const [fileReadStatus, setFileReadStatus] = useState(""); // "Reading file..." etc.

  // --- Hooks ---
  const { file, setFile, error: fileError } = useFileHandler();
  const { transpose, processing, error: transError } = useTransposer();
  const { getAudioContext, audioCtxRef } = useAudioContext();
  const playerRef = useRef(null); // points to the active <audio> or <video> DOM element
  const fileBufferRef = useRef({ file: null, buffer: null }); // cached ArrayBuffer for current file
  const {
    processedItems,
    addProcessedItem,
    handleDeleteProcessed,
    handleClearProcessed,
    refreshProcessedItems,
  } = useProcessedHistory();

  // --- Helpers ---
  const setTransposedFromBlob = useCallback((blob) => {
    if (!blob) { setTransposedSrc(null); return; }
    setTransposedSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  }, []);

  const showNotice = useCallback((type, message) => setNotice({ type, message }), []);

  // Read a File as ArrayBuffer — caches result per file object, shows status for large files
  const readFileArrayBuffer = useCallback(async (f) => {
    if (fileBufferRef.current.file === f && fileBufferRef.current.buffer) {
      return fileBufferRef.current.buffer;
    }
    if (f.size > 10 * 1024 * 1024) setFileReadStatus("Reading file…");
    try {
      const buf = await f.arrayBuffer();
      fileBufferRef.current = { file: f, buffer: buf };
      return buf;
    } finally {
      setFileReadStatus("");
    }
  }, []);

  const formatSemitoneLabel = (value) => {
    const prefix = value > 0 ? `+${value}` : `${value}`;
    return `${prefix} semitone${Math.abs(value) === 1 ? "" : "s"}`;
  };

  // --- YouTube hook ---
  const {
    youtubeUrl,
    setYoutubeUrl,
    youtubeKey,
    setYoutubeKey,
    isProcessingYouTube,
    isAnalyzingKey,
    debounceRef,
    handleYouTube,
    handleAnalyzeKey,
    runYouTubeTranspose,
    cleanup: cleanupYouTube,
  } = useYouTubeTranspose({
    setTransposedFromBlob,
    setOriginalSrc,
    setAppliedSemitones,
    setPendingSemitones,
    setQueuedDelta,
    setPlaying,
    setShowOriginalYouTube,
    setFile,
    setSemitones,
    setAppError,
    addProcessedItem,
    API_BASE_URL,
  });

  // --- Persist settings ---
  useEffect(() => {
    const savedUseWasm = localStorage.getItem("transpose_useWasm");
    const savedFormat = localStorage.getItem("transpose_outputFormat");
    if (savedUseWasm != null) setUseWasm(savedUseWasm === "true");
    if (savedFormat && OUTPUT_FORMATS.includes(savedFormat)) setOutputFormat(savedFormat);
  }, []);

  useEffect(() => { localStorage.setItem("transpose_useWasm", String(useWasm)); }, [useWasm]);
  useEffect(() => { localStorage.setItem("transpose_outputFormat", outputFormat); }, [outputFormat]);

  // --- Animated dots ---
  useEffect(() => {
    if (!(isProcessingYouTube || processing)) { setProcessingDots("."); return; }
    const frames = [".", "..", "..."];
    let i = 0;
    const timer = setInterval(() => { i = (i + 1) % frames.length; setProcessingDots(frames[i]); }, 350);
    return () => clearInterval(timer);
  }, [isProcessingYouTube, processing]);

  useEffect(() => {
    if (!isAnalyzingKey) { setKeyAnalyzeDots("."); return; }
    const frames = [".", "..", "..."];
    let i = 0;
    const timer = setInterval(() => { i = (i + 1) % frames.length; setKeyAnalyzeDots(frames[i]); }, 350);
    return () => clearInterval(timer);
  }, [isAnalyzingKey]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), CONFIG.NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      cleanupYouTube();
      if (transposedSrc) URL.revokeObjectURL(transposedSrc);
      if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close();
      releaseFFmpeg();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Handler: File upload ---
  const handleFileSelect = async (f) => {
    setAppError("");
    fileBufferRef.current = { file: null, buffer: null }; // invalidate cache on new file
    setFile(f);
    setYoutubeUrl("");
    setShowOriginalYouTube(true);
    setYoutubeKey("");
    setSemitones(0);
    setPendingSemitones(null);
    setAppliedSemitones(0);
    setTransposedSrc(null);
    setOriginalSrc(null);
    if (!f) return;
    try {
      if (useWasm && isAudio(f)) {
        const audioBuffer = await (await getAudioContext()).decodeAudioData(await readFileArrayBuffer(f));
        const transposedBuffer = await transposeAudioBuffer(audioBuffer, 0);
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        setTransposedFromBlob(wavBlob);
        setOriginalSrc(URL.createObjectURL(wavBlob));
        setAppliedSemitones(0);
        setPlaying(true);
        const meta = await extractMetadata(wavBlob, "audio");
        addProcessedItem({ id: `${f.name}::0`, type: "audio", label: f.name, title: f.name, blob: wavBlob, semitones: 0, isYouTube: false, fileName: f.name, metadata: meta });
      } else if (useWasm && isVideo(f)) {
        let audioBuffer;
        try {
          audioBuffer = await (await getAudioContext()).decodeAudioData(await readFileArrayBuffer(f));
        } catch (e) {
          setAppError("Failed to decode audio from video file. " + (e.message || ""));
          return;
        }
        const transposedBuffer = await transposeAudioBuffer(audioBuffer, 0);
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        try {
          const remuxedBlob = await remuxVideoWithAudio(f, wavBlob);
          setTransposedFromBlob(remuxedBlob);
          setAppliedSemitones(0);
          setPlaying(true);
          const meta = await extractMetadata(remuxedBlob, "video");
          addProcessedItem({ id: `${f.name}::0`, type: "video", label: f.name, title: f.name, blob: remuxedBlob, semitones: 0, isYouTube: false, fileName: f.name, metadata: meta });
        } catch (e) {
          setAppError("Video remuxing failed. " + (e.message || ""));
        }
      } else {
        const result = await transpose(f, 0, isAudio(f) ? "audio" : "video");
        if (result) {
          setTransposedFromBlob(result);
          setAppliedSemitones(0);
          setPlaying(true);
          const meta = await extractMetadata(result, isAudio(f) ? "audio" : "video");
          addProcessedItem({ id: `${f.name}::0`, type: isAudio(f) ? "audio" : "video", label: f.name, title: f.name, blob: result, semitones: 0, isYouTube: false, fileName: f.name, metadata: meta });
        }
      }
    } catch (e) {
      setTransposedSrc(null);
      setAppError("File processing failed. Please check your file and try again. " + (e?.message || "Unknown error"));
    }
  };

  // --- Handler: Real-time transposition ---
  const runTranspose = useCallback(async (newSemitones) => {
    setAppError("");
    const currentTime = playerRef.current?.currentTime ?? 0;

    if (youtubeUrl) {
      await runYouTubeTranspose(newSemitones, { currentTime, setSeekTo });
      return;
    }
    if (!file) { setAppError("Choose a file or YouTube link first."); return; }
    try {
      if (useWasm && isAudio(file)) {
        const audioBuffer = await (await getAudioContext()).decodeAudioData(await readFileArrayBuffer(file));
        const transposedBuffer = await transposeAudioBuffer(
          audioBuffer,
          tempoMode ? 0 : newSemitones,
          tempoMode ? { timeRatio: 1 / Math.pow(2, newSemitones / 12) } : {}
        );
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        setTransposedFromBlob(wavBlob);
        setAppliedSemitones(newSemitones);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setSeekTo(currentTime);
        setPlaying(true);
      } else if (useWasm && isVideo(file)) {
        const audioBuffer = await (await getAudioContext()).decodeAudioData(await readFileArrayBuffer(file));
        const transposedBuffer = await transposeAudioBuffer(
          audioBuffer,
          tempoMode ? 0 : newSemitones,
          tempoMode ? { timeRatio: 1 / Math.pow(2, newSemitones / 12) } : {}
        );
        const wavBlob = await audioBufferToWavBlob(transposedBuffer);
        const remuxedBlob = await remuxVideoWithAudio(file, wavBlob);
        setTransposedFromBlob(remuxedBlob);
        setAppliedSemitones(newSemitones);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setSeekTo(currentTime);
        setPlaying(true);
      } else {
        const result = await transpose(file, newSemitones, isAudio(file) ? "audio" : "video");
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
    }
  }, [youtubeUrl, file, useWasm, tempoMode, getAudioContext, transpose, runYouTubeTranspose, setTransposedFromBlob]);

  // --- Handler: Transpose value change ---
  const handleTranspose = useCallback((newSemitones) => {
    setSemitones(newSemitones);
    setPendingSemitones(newSemitones);
    setQueuedDelta(newSemitones - appliedSemitones);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (youtubeUrl && !isProcessingYouTube) {
      debounceRef.current = setTimeout(() => runTranspose(newSemitones), CONFIG.TRANSPOSE_DEBOUNCE_MS);
      return;
    }
    if (!isProcessingYouTube) runTranspose(newSemitones);
  }, [appliedSemitones, youtubeUrl, isProcessingYouTube, debounceRef, runTranspose]);

  const handleResetTranspose = useCallback(() => handleTranspose(0), [handleTranspose]);

  // --- Arrow key shortcut: ← / → step semitones when not typing in an input ---
  useEffect(() => {
    if (!file && !youtubeUrl) return;
    const onKeyDown = (e) => {
      if (processing || isProcessingYouTube) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.max(CONFIG.SEMITONE_MIN, semitones - 1);
        if (next !== semitones) handleTranspose(next);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(CONFIG.SEMITONE_MAX, semitones + 1);
        if (next !== semitones) handleTranspose(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file, youtubeUrl, semitones, processing, isProcessingYouTube, handleTranspose]);

  // --- Handler: Load from history ---
  const handleLoadProcessed = (item) => {
    if (item.blob) {
      setTransposedSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(item.blob); });
    } else {
      setTransposedSrc(item.src);
    }
    setSemitones(item.semitones);
    setAppliedSemitones(item.semitones);
    setPendingSemitones(null);
    if (item.isYouTube) {
      setYoutubeUrl(item.youtubeUrl);
      setFile(null);
      setShowOriginalYouTube(false);
      if (item.metadata?.key) {
        setYoutubeKey(item.metadata.key);
      } else {
        setYoutubeKey("");
        setTimeout(() => handleAnalyzeKey(item.youtubeUrl), 1000);
      }
    } else {
      setFile(null);
      setYoutubeUrl("");
      setShowOriginalYouTube(true);
      setYoutubeKey("");
    }
    setTimeout(() => setPlaying(true), 0);
    showNotice("success", `Loaded from history: ${item.label}`);
  };

  // --- Download / Share ---
  const handleDownload = () => {
    if (!transposedSrc) { setAppError("No transposed output to download yet."); return; }
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

  // --- Key display ---
  const originalKeyLabel = youtubeKey || "Unknown";
  const currentKeyLabel = youtubeKey ? transposeDetectedKey(youtubeKey, appliedSemitones) : "Unknown";

  let keyFeedback = null;
  if (isAnalyzingKey) {
    keyFeedback = <span style={{ color: "#f6e05e" }}>Analyzing key from audio...</span>;
  } else if ((isProcessingYouTube || processing) && pendingSemitones !== null) {
    const feedbackText = `Applying ${formatSemitoneLabel(pendingSemitones)}${processingDots}`;
    const queuedText = queuedDelta !== 0 ? `Queued: ${queuedDelta > 0 ? "+" : ""}${queuedDelta} (latest)` : null;
    keyFeedback = (
      <>
        <div style={{ color: "#f6e05e" }}>{feedbackText}</div>
        {queuedText && <div style={{ color: "#f6ad55", fontSize: 12, marginTop: 2 }}>{queuedText}</div>}
      </>
    );
  } else if (youtubeKey) {
    keyFeedback = <span style={{ color: "#9ae6b4" }}>Applied {formatSemitoneLabel(appliedSemitones)}</span>;
  } else {
    keyFeedback = <span style={{ color: "#9ae6b4" }}>Key not analyzed yet.</span>;
  }

  return (
    <div className="App">
      <main className="app-shell">
        <h1 className="app-title">Transpose App</h1>
        <div className="app-card">
          <ProcessedHistory
            processedItems={processedItems}
            onLoad={handleLoadProcessed}
            onDelete={handleDeleteProcessed}
            onClear={handleClearProcessed}
            onRefresh={refreshProcessedItems}
          />

          <YouTubeInput onSubmit={handleYouTube} disabled={processing || isProcessingYouTube} />

          <PlayerSection
            file={file}
            youtubeUrl={youtubeUrl}
            transposedSrc={transposedSrc}
            originalSrc={originalSrc}
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
            youtubeKey={youtubeKey}
            transposeDetectedKey={transposeDetectedKey}
            mediaRef={playerRef}
          />

          {youtubeUrl && (
            <div style={{ textAlign: "center", marginBottom: 8, fontSize: 13, color: "#cbd5e0" }}>
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
            handleReanalyzeKey={() => handleAnalyzeKey()}
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
              min={CONFIG.SEMITONE_MIN}
              max={CONFIG.SEMITONE_MAX}
              onChange={handleTranspose}
              onReset={handleResetTranspose}
              disabled={processing || isProcessingYouTube}
              tempoMode={tempoMode}
              onTempoModeChange={setTempoMode}
            />
          )}

          <Notice notice={notice} />
          {fileReadStatus && (
            <div style={{ textAlign: "center", color: "#f6e05e", fontSize: 13, marginBottom: 6 }}>
              {fileReadStatus}
            </div>
          )}
          <ErrorDisplay error={appError || fileError || transError} />

          {appError && youtubeUrl && !isProcessingYouTube && (
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <button
                onClick={() => { setAppError(""); runTranspose(semitones); }}
                style={{ background: "#f6ad55", color: "#23272e", fontWeight: 700, border: "none", borderRadius: 6, padding: "7px 20px", cursor: "pointer", fontSize: 14 }}
              >
                Retry
              </button>
            </div>
          )}

          {(file || youtubeUrl) && (
            <>
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <label style={{ color: "#fff", marginRight: 8 }}>
                  <input
                    type="checkbox"
                    checked={useWasm}
                    onChange={(e) => setUseWasm(e.target.checked)}
                    disabled={processing}
                    style={{ marginRight: 4 }}
                  />
                  Use in-browser (WASM) transposition
                </label>
              </div>

              {youtubeUrl && (
                <div style={{ textAlign: "center", fontSize: 12, color: "#a0aec0", marginTop: 2, marginBottom: 8 }}>
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

              <ChordSheet keyLabel={currentKeyLabel} />

              <ChordDocGenerator
                songTitle={file?.name || processedItems.find((i) => i.youtubeUrl === youtubeUrl)?.title || ""}
                artist={processedItems.find((i) => i.youtubeUrl === youtubeUrl)?.artist || ""}
                selectedKey={currentKeyLabel}
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
