import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { transposeAudioBuffer } from "./utils/wasmTransposer";
import FileUpload from "./components/FileUpload";
import YouTubeInput from "./components/YouTubeInput";
import TransposeControls from "./components/TransposeControls";
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
import useAnimatedDots from "./hooks/useAnimatedDots";
import ProgressBar from "./components/ProgressBar";

import { isAudio } from "./utils/audioUtils";
import { audioBufferToWavBlob, extractMetadata } from "./utils/audioUtils";
import { isVideo } from "./utils/videoUtils";
import { remuxVideoWithAudio, releaseFFmpeg } from "./utils/videoRemuxer";
import { transposeDetectedKey } from "./utils/keyUtils";
import { CONFIG } from "./utils/config";
import "./App.css";

const OUTPUT_FORMATS = ["mp3", "mp4"];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

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
  const [showOriginalAB, setShowOriginalAB] = useState(false);
  const [appliedSemitones, setAppliedSemitones] = useState(0);
  const [pendingSemitones, setPendingSemitones] = useState(null);
  const [queuedDelta, setQueuedDelta] = useState(0);
  const [notice, setNotice] = useState(null);
  const [tempoMode, setTempoMode] = useState(false);
  const [fileReadStatus, setFileReadStatus] = useState("");
  const [fileKey, setFileKey] = useState("");
  const [isAnalyzingFileKey, setIsAnalyzingFileKey] = useState(false);
  const [wasmProgress, setWasmProgress] = useState(0);
  const [ytProgress, setYtProgress] = useState(0);
  const ytProgressRef = useRef(0);
  const ytTickRef = useRef(null);
  const [showChordDoc, setShowChordDoc] = useState(false);

  // --- Hooks ---
  const { file, setFile, error: fileError } = useFileHandler();
  const { transpose, processing, error: transError } = useTransposer();
  const { getAudioContext, audioCtxRef } = useAudioContext();
  const playerRef = useRef(null);
  const fileBufferRef = useRef({ file: null, buffer: null });
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
    processingStep,
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
    tempoMode,
  });

  const processingDots = useAnimatedDots(isProcessingYouTube || processing);
  const keyAnalyzeDots = useAnimatedDots(isAnalyzingKey || isAnalyzingFileKey);

  // --- Persist settings ---
  useEffect(() => {
    const savedUseWasm = localStorage.getItem("transpose_useWasm");
    const savedFormat = localStorage.getItem("transpose_outputFormat");
    if (savedUseWasm != null) setUseWasm(savedUseWasm === "true");
    if (savedFormat && OUTPUT_FORMATS.includes(savedFormat)) setOutputFormat(savedFormat);
  }, []);

  useEffect(() => { localStorage.setItem("transpose_useWasm", String(useWasm)); }, [useWasm]);
  useEffect(() => { localStorage.setItem("transpose_outputFormat", outputFormat); }, [outputFormat]);
  useEffect(() => { setShowOriginalAB(false); }, [appliedSemitones]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), CONFIG.NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // --- YouTube progress animation ---
  useEffect(() => {
    if (ytTickRef.current) clearInterval(ytTickRef.current);
    if (!isProcessingYouTube) {
      if (ytProgressRef.current > 0) {
        ytProgressRef.current = 100;
        setYtProgress(100);
        const t = setTimeout(() => { ytProgressRef.current = 0; setYtProgress(0); }, 600);
        return () => clearTimeout(t);
      }
      return;
    }
    const getRange = (step) => {
      if (!step) return [5, 44];
      if (step.includes("1/3") || step.includes("Downloading") || step.includes("Applying")) return [5, 44];
      if (step.includes("2/3") || step.includes("Extracting")) return [48, 64];
      if (step.includes("3/3") || step.includes("Detecting")) return [68, 88];
      if (step.includes("Finalizing")) return [88, 94];
      return [5, 44];
    };
    const [floor, ceiling] = getRange(processingStep);
    if (ytProgressRef.current < floor) {
      ytProgressRef.current = floor;
      setYtProgress(floor);
    }
    ytTickRef.current = setInterval(() => {
      if (ytProgressRef.current < ceiling) {
        const inc = Math.max(0.3, (ceiling - ytProgressRef.current) * 0.03);
        ytProgressRef.current = Math.min(ceiling, ytProgressRef.current + inc);
        setYtProgress(Math.round(ytProgressRef.current));
      }
    }, 500);
    return () => clearInterval(ytTickRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessingYouTube, processingStep]);

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

  // --- Shared WASM transpose logic ---
  const runWasmTranspose = useCallback(async (f, newSemitones) => {
    setWasmProgress(5);
    const rawBuf = await readFileArrayBuffer(f);
    setWasmProgress(25);
    const audioBuffer = await (await getAudioContext()).decodeAudioData(rawBuf.slice(0));
    setWasmProgress(55);
    const transposedBuffer = await transposeAudioBuffer(
      audioBuffer,
      tempoMode ? 0 : newSemitones,
      tempoMode ? { timeRatio: 1 / Math.pow(2, newSemitones / 12) } : {}
    );
    setWasmProgress(90);
    const wavBlob = await audioBufferToWavBlob(transposedBuffer);
    setWasmProgress(100);
    return isVideo(f) ? remuxVideoWithAudio(f, wavBlob) : wavBlob;
  }, [getAudioContext, readFileArrayBuffer, tempoMode]);

  const analyzeFileKey = useCallback(async (audioBlob, filename) => {
    if (!audioBlob) return;
    setIsAnalyzingFileKey(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/detect-key`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Filename": (filename || "audio.wav") },
        body: await audioBlob.arrayBuffer(),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setFileKey(data.key || "Unknown");
    } catch {
      setFileKey("");
    } finally {
      setIsAnalyzingFileKey(false);
    }
  }, [API_BASE_URL]);

  // --- Handler: File upload ---
  const handleFileSelect = useCallback(async (f) => {
    setAppError("");
    fileBufferRef.current = { file: null, buffer: null };
    setFile(f);
    setYoutubeUrl("");
    setShowOriginalYouTube(true);
    setYoutubeKey("");
    setFileKey("");
    setSemitones(0);
    setPendingSemitones(null);
    setAppliedSemitones(0);
    setTransposedSrc(null);
    setOriginalSrc(null);
    if (!f) return;
    try {
      if (useWasm && (isAudio(f) || isVideo(f))) {
        let blob;
        try {
          blob = await runWasmTranspose(f, 0);
        } catch (e) {
          setWasmProgress(0);
          if (isVideo(f)) { setAppError("Video remuxing failed. " + (e.message || "")); return; }
          throw e;
        }
        setTimeout(() => setWasmProgress(0), 500);
        setTransposedFromBlob(blob);
        setOriginalSrc(URL.createObjectURL(blob));
        setAppliedSemitones(0);
        setPlaying(true);
        const meta = await extractMetadata(blob, isVideo(f) ? "video" : "audio");
        addProcessedItem({ id: `${f.name}::0`, type: isVideo(f) ? "video" : "audio", label: f.name, title: f.name, blob, semitones: 0, isYouTube: false, fileName: f.name, metadata: meta });
        analyzeFileKey(blob, f.name.replace(/\.[^.]+$/, "") + ".wav");
      } else {
        const result = await transpose(f, 0, isAudio(f) ? "audio" : "video");
        if (result) {
          setTransposedFromBlob(result);
          setAppliedSemitones(0);
          setPlaying(true);
          const meta = await extractMetadata(result, isAudio(f) ? "audio" : "video");
          addProcessedItem({ id: `${f.name}::0`, type: isAudio(f) ? "audio" : "video", label: f.name, title: f.name, blob: result, semitones: 0, isYouTube: false, fileName: f.name, metadata: meta });
          analyzeFileKey(result, f.name.replace(/\.[^.]+$/, "") + ".wav");
        }
      }
    } catch (e) {
      setWasmProgress(0);
      setTransposedSrc(null);
      setAppError("File processing failed. Please check your file and try again. " + (e?.message || "Unknown error"));
    }
  }, [useWasm, runWasmTranspose, transpose, setTransposedFromBlob, setFile, setYoutubeUrl, setYoutubeKey, addProcessedItem, analyzeFileKey]);

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
      if (useWasm && (isAudio(file) || isVideo(file))) {
        const blob = await runWasmTranspose(file, newSemitones);
        setTimeout(() => setWasmProgress(0), 500);
        setTransposedFromBlob(blob);
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
      setWasmProgress(0);
      setTransposedSrc(null);
      setAppError("Transposition failed: " + (e?.message || "Unknown error"));
    }
  }, [youtubeUrl, file, useWasm, runWasmTranspose, transpose, runYouTubeTranspose, setTransposedFromBlob]);

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

  // --- Arrow key shortcut ---
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
  const handleLoadProcessed = useCallback((item) => {
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
  }, [handleAnalyzeKey, showNotice, setFile, setYoutubeUrl, setYoutubeKey]);

  // --- Download / Share ---
  const handleDownload = useCallback(() => {
    if (!transposedSrc) { setAppError("No transposed output to download yet."); return; }
    const rawTitle =
      processedItems.find(i => i.youtubeUrl === youtubeUrl && Number(i.semitones) === 0)?.title ||
      file?.name?.replace(/\.[^.]+$/, "") ||
      "transposed";
    const safeName = rawTitle.replace(/[^a-z0-9_\-]/gi, "_").replace(/_+/g, "_").slice(0, 48);
    const stLabel = appliedSemitones !== 0 ? `_${appliedSemitones > 0 ? "+" : ""}${appliedSemitones}st` : "";
    const fileName = `${safeName}${stLabel}.${outputFormat}`;
    const a = document.createElement("a");
    a.href = transposedSrc;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotice("success", `Downloaded ${fileName}`);
  }, [transposedSrc, processedItems, youtubeUrl, file, appliedSemitones, outputFormat, showNotice]);

  const handleShare = useCallback(() => {
    if (navigator.share && transposedSrc) {
      navigator.share({ url: transposedSrc });
      showNotice("success", "Share sheet opened.");
    } else {
      setAppError("Sharing is not supported on this device/browser.");
    }
  }, [transposedSrc, showNotice]);

  // --- Key display ---
  const activeKey = youtubeUrl ? youtubeKey : fileKey;
  const originalKeyLabel = activeKey || "Unknown";
  const currentKeyLabel = activeKey ? transposeDetectedKey(activeKey, appliedSemitones) : "Unknown";

  const keyFeedback = useMemo(() => {
    if (isAnalyzingKey || isAnalyzingFileKey) {
      return <span style={{ color: "#f6e05e" }}>Analyzing key from audio...</span>;
    }
    if ((isProcessingYouTube || processing) && pendingSemitones !== null) {
      const feedbackText = `Applying ${formatSemitoneLabel(pendingSemitones)}${processingDots}`;
      const queuedText = queuedDelta !== 0 ? `Queued: ${queuedDelta > 0 ? "+" : ""}${queuedDelta} (latest)` : null;
      return (
        <>
          <div style={{ color: "#f6e05e" }}>{feedbackText}</div>
          {queuedText && <div style={{ color: "#90cdf4", fontSize: 12, marginTop: 2 }}>{queuedText}</div>}
        </>
      );
    }
    if (activeKey) {
      return <span style={{ color: "#9ae6b4" }}>Applied {formatSemitoneLabel(appliedSemitones)}</span>;
    }
    return <span style={{ color: "#9ae6b4" }}>Key not analyzed yet.</span>;
  }, [isAnalyzingKey, isAnalyzingFileKey, isProcessingYouTube, processing, pendingSemitones, processingDots, queuedDelta, activeKey, appliedSemitones]);

  return (
    <div className="App">
      <main className="app-shell">
        <h1 className="app-title">TransposeMe</h1>
        <p className="app-subtitle">Shift pitch &amp; tempo of YouTube videos and audio files — locally, instantly.</p>
        <div className="app-card">
          <ProcessedHistory
            processedItems={processedItems}
            onLoad={handleLoadProcessed}
            onDelete={handleDeleteProcessed}
            onClear={handleClearProcessed}
            onRefresh={refreshProcessedItems}
          />

          {!file && !youtubeUrl && (
            <div className="empty-state">
              <div className="empty-state-steps">
                <div className="empty-state-step"><span className="empty-state-num">1</span>Paste a YouTube link or upload an audio/video file</div>
                <div className="empty-state-step"><span className="empty-state-num">2</span>Drag the slider or pick a target key</div>
                <div className="empty-state-step"><span className="empty-state-num">3</span>Download the transposed file</div>
              </div>
            </div>
          )}

          <YouTubeInput onSubmit={handleYouTube} disabled={processing || isProcessingYouTube} />

          {isProcessingYouTube && (
            <ProgressBar progress={ytProgress} label={processingStep || "Processing…"} />
          )}
          {wasmProgress > 0 && (
            <ProgressBar
              progress={wasmProgress}
              label={
                wasmProgress < 25 ? "Reading file…" :
                wasmProgress < 55 ? "Decoding audio…" :
                wasmProgress < 90 ? "Transposing audio…" :
                "Finalizing…"
              }
            />
          )}

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
            processedItems={processedItems}
            controlsDisabled={processing || isProcessingYouTube}
            youtubeKey={youtubeKey}
            mediaRef={playerRef}
            showOriginal={showOriginalAB}
            setShowOriginal={setShowOriginalAB}
          />

          {(youtubeUrl || (file && activeKey)) && (
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
            file={file}
            isAnalyzingKey={isAnalyzingKey || isAnalyzingFileKey}
            isProcessingYouTube={isProcessingYouTube}
            handleAnalyzeKey={youtubeUrl ? handleAnalyzeKey : () => analyzeFileKey(file)}
            handleReanalyzeKey={youtubeUrl ? () => handleAnalyzeKey() : () => analyzeFileKey(file)}
            keyFeedback={keyFeedback}
            keyAnalyzeDots={keyAnalyzeDots}
            youtubeKey={activeKey}
          >
            <KeySelector
              youtubeKey={activeKey}
              appliedSemitones={appliedSemitones}
              processing={processing || isAnalyzingFileKey}
              isProcessingYouTube={isProcessingYouTube}
              handleTranspose={handleTranspose}
              processedItems={processedItems}
              youtubeUrl={youtubeUrl}
              showingOriginal={showOriginalAB}
            />
          </YouTubeKeyAnalysis>

          {(file || youtubeUrl) && (
            <TransposeControls
              value={semitones}
              min={CONFIG.SEMITONE_MIN}
              max={CONFIG.SEMITONE_MAX}
              onChange={handleTranspose}
              onVisualChange={setSemitones}
              onReset={handleResetTranspose}
              disabled={processing || isProcessingYouTube}
              tempoMode={tempoMode}
              onTempoModeChange={setTempoMode}
            />
          )}

          <Notice notice={notice} />
          {fileReadStatus && wasmProgress === 0 && (
            <div style={{ textAlign: "center", color: "#f6e05e", fontSize: 13, marginBottom: 6 }}>
              {fileReadStatus}
            </div>
          )}
          <ErrorDisplay error={appError || fileError || transError} />

          {appError && youtubeUrl && !isProcessingYouTube && (
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <button
                onClick={() => { setAppError(""); runTranspose(semitones); }}
                style={{ background: "#3182ce", color: "#fff", fontWeight: 700, border: "none", borderRadius: 6, padding: "7px 20px", cursor: "pointer", fontSize: 14 }}
              >
                Retry
              </button>
            </div>
          )}

          {(file || youtubeUrl) && (
            <>
              {!youtubeUrl && (
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
              )}

              {youtubeUrl && !isProcessingYouTube && (
                <div style={{ textAlign: "center", fontSize: 12, color: "#a0aec0", marginTop: 2, marginBottom: 8 }}>
                  Tip: use +/− for quick transpose previews; latest request is applied.
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

              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button
                  onClick={() => setShowChordDoc((v) => !v)}
                  style={{
                    background: showChordDoc ? "#4a5568" : "#2d3748",
                    color: "#f6e05e",
                    border: "1px solid #4a5568",
                    borderRadius: 6,
                    padding: "6px 18px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {showChordDoc ? "Hide Chord Sheet Generator ▲" : "Get Chord Sheet ▼"}
                </button>
              </div>

              {showChordDoc && (
                <ChordDocGenerator
                  songTitle={file?.name || processedItems.find((i) => i.youtubeUrl === youtubeUrl)?.title || ""}
                  artist={processedItems.find((i) => i.youtubeUrl === youtubeUrl)?.artist || ""}
                  selectedKey={currentKeyLabel}
                />
              )}
            </>
          )}

          <FileUpload onFileSelect={handleFileSelect} disabled={processing || isProcessingYouTube} />
          <FAQ />
        </div>
      </main>
      <footer style={{ textAlign: "center", color: "#4a5568", fontSize: 12, padding: "16px 0 12px" }}>
        &copy; {new Date().getFullYear()} Shern Ning
      </footer>
    </div>
  );
}

export default App;
