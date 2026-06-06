import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
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
import useTransposeState from "./hooks/useTransposeState";
import ProgressBar from "./components/ProgressBar";

import { isAudio } from "./utils/audioUtils";
import { audioBufferToWavBlob, extractMetadata } from "./utils/audioUtils";
import { isVideo } from "./utils/videoUtils";
import { remuxVideoWithAudio, releaseFFmpeg } from "./utils/videoRemuxer";
import { transposeDetectedKey } from "./utils/keyUtils";
import { CONFIG } from "./utils/config";
import AuroraBackground from "./components/fx/AuroraBackground";
import { ShinyTitle, Typewriter } from "./components/fx/HeroText";
import BorderBeam from "./components/fx/BorderBeam";
import MultiStepLoader from "./components/fx/MultiStepLoader";
import { YT_STEPS, stepIndexFromLabel } from "./components/fx/ytSteps";
import { fireConfetti } from "./utils/confetti";
import "./App.css";

const OUTPUT_FORMATS = ["mp3", "mp4"];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function App() {
  // --- Core state ---
  const [appError, setAppError] = useState("");
  const {
    semitones,
    appliedSemitones,
    pendingSemitones,
    queuedDelta,
    setSemitones,
    setAppliedSemitones,
    setPendingSemitones,
    setQueuedDelta,
  } = useTransposeState();
  const [outputFormat, setOutputFormat] = useState(OUTPUT_FORMATS[0]);
  const [transposedSrc, setTransposedSrc] = useState(null);
  const [originalSrc, setOriginalSrc] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [seekTo, setSeekTo] = useState(null);
  const [useWasm, setUseWasm] = useState(true);
  const [showOriginalYouTube, setShowOriginalYouTube] = useState(true);
  const [showOriginalAB, setShowOriginalAB] = useState(false);
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
  const [showSlowTransposeNote, setShowSlowTransposeNote] = useState(false);
  const slowTransposeTimerRef = useRef(null);

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
    if (!blob) {
      setTransposedSrc(null);
      return;
    }
    setTransposedSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  }, []);

  const showNotice = useCallback(
    (type, message) => setNotice({ type, message }),
    [],
  );

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
    if (savedFormat && OUTPUT_FORMATS.includes(savedFormat))
      setOutputFormat(savedFormat);
  }, []);

  useEffect(() => {
    localStorage.setItem("transpose_useWasm", String(useWasm));
  }, [useWasm]);
  useEffect(() => {
    localStorage.setItem("transpose_outputFormat", outputFormat);
  }, [outputFormat]);
  useEffect(() => {
    setShowOriginalAB(false);
  }, [appliedSemitones]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), CONFIG.NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (slowTransposeTimerRef.current) {
      clearTimeout(slowTransposeTimerRef.current);
      slowTransposeTimerRef.current = null;
    }

    if (processing || isProcessingYouTube) {
      setShowSlowTransposeNote(false);
      slowTransposeTimerRef.current = setTimeout(
        () => setShowSlowTransposeNote(true),
        CONFIG.SLOW_TRANSPOSE_NOTICE_MS,
      );
    } else {
      setShowSlowTransposeNote(false);
    }

    return () => {
      if (slowTransposeTimerRef.current) {
        clearTimeout(slowTransposeTimerRef.current);
        slowTransposeTimerRef.current = null;
      }
    };
  }, [processing, isProcessingYouTube]);

  // --- YouTube progress animation ---
  useEffect(() => {
    if (ytTickRef.current) clearInterval(ytTickRef.current);
    if (!isProcessingYouTube) {
      if (ytProgressRef.current > 0) {
        ytProgressRef.current = 100;
        setYtProgress(100);
        const t = setTimeout(() => {
          ytProgressRef.current = 0;
          setYtProgress(0);
        }, 600);
        return () => clearTimeout(t);
      }
      return;
    }
    const getRange = (step) => {
      if (!step) return [5, 44];
      if (
        step.includes("1/3") ||
        step.includes("Downloading") ||
        step.includes("Applying")
      )
        return [5, 44];
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
  const runWasmTranspose = useCallback(
    async (f, newSemitones) => {
      setWasmProgress(5);
      const rawBuf = await readFileArrayBuffer(f);
      setWasmProgress(25);
      const audioBuffer = await (
        await getAudioContext()
      ).decodeAudioData(rawBuf.slice(0));
      setWasmProgress(55);
      const transposedBuffer = await transposeAudioBuffer(
        audioBuffer,
        tempoMode ? 0 : newSemitones,
        tempoMode ? { timeRatio: 1 / Math.pow(2, newSemitones / 12) } : {},
      );
      setWasmProgress(90);
      const wavBlob = await audioBufferToWavBlob(transposedBuffer);
      setWasmProgress(100);
      return isVideo(f) ? remuxVideoWithAudio(f, wavBlob) : wavBlob;
    },
    [getAudioContext, readFileArrayBuffer, tempoMode],
  );

  const analyzeFileKey = useCallback(
    async (audioBlob, filename) => {
      if (!audioBlob) return;
      setIsAnalyzingFileKey(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/detect-key`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Filename": filename || "audio.wav",
          },
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
    },
    [API_BASE_URL],
  );

  // Wire a freshly-processed file blob into player + history + key analysis.
  // Shared by the WASM and server-side branches of handleFileSelect.
  const finalizeProcessed = useCallback(
    async (blob, f, { setOriginal = false } = {}) => {
      const type = isVideo(f) ? "video" : "audio";
      setTransposedFromBlob(blob);
      if (setOriginal) setOriginalSrc(URL.createObjectURL(blob));
      setAppliedSemitones(0);
      setPlaying(true);
      const meta = await extractMetadata(blob, type);
      addProcessedItem({
        id: `${f.name}::0`,
        type,
        label: f.name,
        title: f.name,
        blob,
        semitones: 0,
        isYouTube: false,
        fileName: f.name,
        metadata: meta,
      });
      analyzeFileKey(blob, f.name.replace(/\.[^.]+$/, "") + ".wav");
      fireConfetti();
    },
    [
      setTransposedFromBlob,
      setAppliedSemitones,
      addProcessedItem,
      analyzeFileKey,
    ],
  );

  // Apply a transpose result to the player without touching history.
  // Shared by the WASM and server-side branches of runTranspose.
  const applyTransposeResult = useCallback(
    (blob, newSemitones, currentTime) => {
      setTransposedFromBlob(blob);
      setAppliedSemitones(newSemitones);
      setPendingSemitones(null);
      setQueuedDelta(0);
      setSeekTo(currentTime);
      setPlaying(true);
    },
    [
      setTransposedFromBlob,
      setAppliedSemitones,
      setPendingSemitones,
      setQueuedDelta,
    ],
  );

  // --- Handler: File upload ---
  const handleFileSelect = useCallback(
    async (f) => {
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
            if (isVideo(f)) {
              setAppError("Video remuxing failed. " + (e.message || ""));
              return;
            }
            throw e;
          }
          setTimeout(() => setWasmProgress(0), 500);
          await finalizeProcessed(blob, f, { setOriginal: true });
        } else {
          const result = await transpose(f, 0, isAudio(f) ? "audio" : "video");
          if (result) {
            await finalizeProcessed(result, f);
          }
        }
      } catch (e) {
        setWasmProgress(0);
        setTransposedSrc(null);
        setAppError(
          "File processing failed. Please check your file and try again. " +
            (e?.message || "Unknown error"),
        );
      }
    },
    [
      useWasm,
      runWasmTranspose,
      transpose,
      finalizeProcessed,
      setFile,
      setYoutubeUrl,
      setYoutubeKey,
      setSemitones,
      setPendingSemitones,
      setAppliedSemitones,
    ],
  );

  // --- Handler: Real-time transposition ---
  const runTranspose = useCallback(
    async (newSemitones) => {
      setAppError("");
      const currentTime = playerRef.current?.currentTime ?? 0;

      if (youtubeUrl) {
        await runYouTubeTranspose(newSemitones, { currentTime, setSeekTo });
        return;
      }
      if (!file) {
        setAppError("Choose a file or YouTube link first.");
        return;
      }
      try {
        if (useWasm && (isAudio(file) || isVideo(file))) {
          const blob = await runWasmTranspose(file, newSemitones);
          setTimeout(() => setWasmProgress(0), 500);
          applyTransposeResult(blob, newSemitones, currentTime);
        } else {
          const result = await transpose(
            file,
            newSemitones,
            isAudio(file) ? "audio" : "video",
          );
          if (result) {
            applyTransposeResult(result, newSemitones, currentTime);
          }
        }
      } catch (e) {
        setWasmProgress(0);
        setTransposedSrc(null);
        setAppError("Transposition failed: " + (e?.message || "Unknown error"));
      }
    },
    [
      youtubeUrl,
      file,
      useWasm,
      runWasmTranspose,
      transpose,
      runYouTubeTranspose,
      applyTransposeResult,
    ],
  );

  // --- Handler: Transpose value change ---
  const handleTranspose = useCallback(
    (newSemitones) => {
      setSemitones(newSemitones);
      setPendingSemitones(newSemitones);
      setQueuedDelta(newSemitones - appliedSemitones);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (youtubeUrl && !isProcessingYouTube) {
        debounceRef.current = setTimeout(
          () => runTranspose(newSemitones),
          CONFIG.TRANSPOSE_DEBOUNCE_MS,
        );
        return;
      }
      if (!isProcessingYouTube) runTranspose(newSemitones);
    },
    [
      appliedSemitones,
      youtubeUrl,
      isProcessingYouTube,
      debounceRef,
      runTranspose,
      setSemitones,
      setPendingSemitones,
      setQueuedDelta,
    ],
  );

  const handleResetTranspose = useCallback(
    () => handleTranspose(0),
    [handleTranspose],
  );

  // --- Arrow key shortcut ---
  useEffect(() => {
    if (!file && !youtubeUrl) return;
    const onKeyDown = (e) => {
      if (processing || isProcessingYouTube) return;
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      )
        return;
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
  }, [
    file,
    youtubeUrl,
    semitones,
    processing,
    isProcessingYouTube,
    handleTranspose,
  ]);

  // --- Handler: Load from history ---
  const handleLoadProcessed = useCallback(
    async (item) => {
      const blob = item.blob;

      // No stored blob → re-download from YouTube link
      if (!blob && !item.src && item.isYouTube && item.youtubeUrl) {
        showNotice("success", `Re-downloading "${item.label}" from YouTube…`);
        setFile(null);
        setYoutubeKey(item.metadata?.key || "");
        await handleYouTube(item.youtubeUrl);
        if (Number(item.semitones) !== 0) {
          handleTranspose(Number(item.semitones));
        }
        return;
      }

      if (blob) {
        setTransposedSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } else if (item.src) {
        setTransposedSrc(item.src);
      } else {
        setAppError("This history item has no playable data.");
        return;
      }
      setSemitones(Number(item.semitones));
      setAppliedSemitones(Number(item.semitones));
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
    },
    [
      handleAnalyzeKey,
      handleYouTube,
      handleTranspose,
      showNotice,
      setFile,
      setYoutubeUrl,
      setYoutubeKey,
      setSemitones,
      setAppliedSemitones,
      setPendingSemitones,
    ],
  );

  // --- Download / Share ---
  const handleDownload = useCallback(() => {
    if (!transposedSrc) {
      setAppError("No transposed output to download yet.");
      return;
    }
    const rawTitle =
      processedItems.find(
        (i) => i.youtubeUrl === youtubeUrl && Number(i.semitones) === 0,
      )?.title ||
      file?.name?.replace(/\.[^.]+$/, "") ||
      "transposed";
    const safeName = rawTitle
      .replace(/[^a-z0-9_-]/gi, "_")
      .replace(/_+/g, "_")
      .slice(0, 48);
    const stLabel =
      appliedSemitones !== 0
        ? `_${appliedSemitones > 0 ? "+" : ""}${appliedSemitones}st`
        : "";
    const fileName = `${safeName}${stLabel}.${outputFormat}`;
    const a = document.createElement("a");
    a.href = transposedSrc;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotice("success", `Downloaded ${fileName}`);
    fireConfetti();
  }, [
    transposedSrc,
    processedItems,
    youtubeUrl,
    file,
    appliedSemitones,
    outputFormat,
    showNotice,
  ]);

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
  const currentKeyLabel = activeKey
    ? transposeDetectedKey(activeKey, appliedSemitones)
    : "Unknown";

  const keyFeedback = useMemo(() => {
    if (isAnalyzingKey || isAnalyzingFileKey) {
      return (
        <span style={{ color: "#f6e05e" }}>Analyzing key from audio...</span>
      );
    }
    if ((isProcessingYouTube || processing) && pendingSemitones !== null) {
      const feedbackText = `Applying ${formatSemitoneLabel(pendingSemitones)}${processingDots}`;
      const queuedText =
        queuedDelta !== 0
          ? `Queued: ${queuedDelta > 0 ? "+" : ""}${queuedDelta} (latest)`
          : null;
      return (
        <>
          <div style={{ color: "#f6e05e" }}>{feedbackText}</div>
          {queuedText && (
            <div style={{ color: "#90cdf4", fontSize: 12, marginTop: 2 }}>
              {queuedText}
            </div>
          )}
        </>
      );
    }
    if (activeKey) {
      return (
        <span style={{ color: "#9ae6b4" }}>
          Applied {formatSemitoneLabel(appliedSemitones)}
        </span>
      );
    }
    return <span style={{ color: "#9ae6b4" }}>Key not analyzed yet.</span>;
  }, [
    isAnalyzingKey,
    isAnalyzingFileKey,
    isProcessingYouTube,
    processing,
    pendingSemitones,
    processingDots,
    queuedDelta,
    activeKey,
    appliedSemitones,
  ]);

  return (
    <div className='App'>
      <AuroraBackground paused={processing || isProcessingYouTube} />
      <main className='app-shell'>
        <ShinyTitle>TransposeMe</ShinyTitle>
        <Typewriter text='Shift pitch & tempo of YouTube videos and audio files — locally, instantly.' />
        {showSlowTransposeNote && (
          <div className='slow-transpose-note'>
            ⏱️ This transpose is taking longer than expected. Due to server
            bottlenecks, it may take 1 to 5 minutes to complete.
          </div>
        )}
        <div
          className={`app-card${processing || isProcessingYouTube ? " is-processing" : ""}`}
        >
          {(processing || isProcessingYouTube) && <BorderBeam />}
          <ProcessedHistory
            processedItems={processedItems}
            onLoad={handleLoadProcessed}
            onDelete={handleDeleteProcessed}
            onClear={handleClearProcessed}
            onRefresh={refreshProcessedItems}
          />

          {!file && !youtubeUrl && (
            <div className='empty-state'>
              <div className='empty-state-steps'>
                <div className='empty-state-step'>
                  <span className='empty-state-num'>1</span>Paste a YouTube link
                  or upload an audio/video file
                </div>
                <div className='empty-state-step'>
                  <span className='empty-state-num'>2</span>Drag the slider or
                  pick a target key
                </div>
                <div className='empty-state-step'>
                  <span className='empty-state-num'>3</span>Download the
                  transposed file
                </div>
              </div>
            </div>
          )}

          <YouTubeInput
            onSubmit={handleYouTube}
            disabled={processing || isProcessingYouTube}
          />

          {isProcessingYouTube && (
            <div className='yt-processing'>
              <MultiStepLoader
                steps={YT_STEPS}
                current={stepIndexFromLabel(processingStep)}
              />
              <ProgressBar
                progress={ytProgress}
                label={processingStep || "Processing…"}
              />
            </div>
          )}
          {wasmProgress > 0 && (
            <ProgressBar
              progress={wasmProgress}
              label={
                wasmProgress < 25
                  ? "Reading file…"
                  : wasmProgress < 55
                    ? "Decoding audio…"
                    : wasmProgress < 90
                      ? "Transposing audio…"
                      : "Finalizing…"
              }
            />
          )}

          {(file || youtubeUrl) && (
            <div className='workspace'>
              <section className='workspace-media'>
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
                  <div className='key-display'>
                    <span className='key-display-original'>
                      Original key:{" "}
                      <span className='key-display-original-value'>
                        {originalKeyLabel}
                      </span>
                    </span>
                    <span>
                      Current key:{" "}
                      <span className='key-display-current-value'>
                        {currentKeyLabel}
                      </span>
                    </span>
                  </div>
                )}

                <YouTubePlayer url={youtubeUrl} show={showOriginalYouTube} />
              </section>

              <section className='workspace-controls'>
                <YouTubeKeyAnalysis
                  youtubeUrl={youtubeUrl}
                  file={file}
                  isAnalyzingKey={isAnalyzingKey || isAnalyzingFileKey}
                  isProcessingYouTube={isProcessingYouTube}
                  handleAnalyzeKey={
                    youtubeUrl ? handleAnalyzeKey : () => analyzeFileKey(file)
                  }
                  handleReanalyzeKey={
                    youtubeUrl
                      ? () => handleAnalyzeKey()
                      : () => analyzeFileKey(file)
                  }
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

                {!youtubeUrl && (
                  <div className='center-row'>
                    <label className='wasm-toggle-label'>
                      <input
                        type='checkbox'
                        className='wasm-toggle-checkbox'
                        checked={useWasm}
                        onChange={(e) => setUseWasm(e.target.checked)}
                        disabled={processing}
                      />
                      Use in-browser (WASM) transposition
                    </label>
                  </div>
                )}

                {youtubeUrl && !isProcessingYouTube && (
                  <div className='transpose-tip'>
                    Tip: use +/− for quick transpose previews; latest request is
                    applied.
                  </div>
                )}

                <DownloadShare
                  onDownload={handleDownload}
                  onShare={handleShare}
                  disabled={!transposedSrc || processing || isProcessingYouTube}
                  formats={OUTPUT_FORMATS}
                  selectedFormat={outputFormat}
                  onFormatChange={setOutputFormat}
                />

                <ChordSheet keyLabel={currentKeyLabel} />

                <div className='chord-doc-toggle-row'>
                  <button
                    className={`chord-doc-toggle-btn${showChordDoc ? " open" : ""}`}
                    onClick={() => setShowChordDoc((v) => !v)}
                  >
                    {showChordDoc
                      ? "Hide Chord Sheet Generator ▲"
                      : "Get Chord Sheet ▼"}
                  </button>
                </div>

                {showChordDoc && (
                  <ChordDocGenerator
                    songTitle={
                      file?.name ||
                      processedItems.find((i) => i.youtubeUrl === youtubeUrl)
                        ?.title ||
                      ""
                    }
                    artist={
                      processedItems.find((i) => i.youtubeUrl === youtubeUrl)
                        ?.artist || ""
                    }
                    selectedKey={currentKeyLabel}
                  />
                )}
              </section>
            </div>
          )}

          <Notice notice={notice} />
          {fileReadStatus && wasmProgress === 0 && (
            <div className='file-read-status'>{fileReadStatus}</div>
          )}
          <ErrorDisplay error={appError || fileError || transError} />

          {appError && youtubeUrl && !isProcessingYouTube && (
            <div className='center-row'>
              <button
                className='retry-btn'
                onClick={() => {
                  setAppError("");
                  runTranspose(semitones);
                }}
              >
                Retry
              </button>
            </div>
          )}

          <FileUpload
            onFileSelect={handleFileSelect}
            disabled={processing || isProcessingYouTube}
          />
          <FAQ />
        </div>
      </main>
      <footer className='app-footer'>
        <div className='app-footer-inner'>
          {[
            { label: "Chord Vault", url: "https://chordvault-ten.vercel.app/" },
            {
              label: "Workout Tracker",
              url: "https://workouttracker-xi.vercel.app",
            },
          ].map(({ label, url }) => (
            <a
              key={label}
              className='app-footer-link'
              href={url}
              target='_blank'
              rel='noopener noreferrer'
            >
              {label}
            </a>
          ))}
          &copy; {new Date().getFullYear()} Shern Ning
        </div>
      </footer>
    </div>
  );
}

export default App;
