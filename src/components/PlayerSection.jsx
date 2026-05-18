import React, { memo } from "react";
import { isAudio } from "../utils/audioUtils";
import { isVideo } from "../utils/videoUtils";
import { transposeDetectedKey } from "../utils/keyUtils";
import AudioPlayer from "./AudioPlayer";
import VideoPlayer from "./VideoPlayer";

function formatDuration(seconds) {
  if (!isFinite(seconds)) return '';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor((seconds / 60) % 60).toString();
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${m.padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}

function PlayerSection({
  file,
  youtubeUrl,
  transposedSrc,
  originalSrc,
  playing,
  setPlaying,
  processing,
  isProcessingYouTube,
  seekTo,
  semitones,
  appliedSemitones,
  processedItems = [],
  controlsDisabled = false,
  youtubeKey,
  mediaRef,
  showOriginal,
  setShowOriginal,
}) {

  // Only show A/B toggle when we have both original and transposed and semitones ≠ 0
  const canAB = originalSrc && transposedSrc && appliedSemitones !== 0;
  const activeSrc = canAB && showOriginal ? originalSrc : transposedSrc;

  // Find metadata for current file/youtubeUrl
  let processedItem = null;
  if (file) {
    processedItem = processedItems.find(
      (item) => item.fileName === file.name && Number(item.semitones) === Number(appliedSemitones)
    );
  } else if (youtubeUrl) {
    processedItem = processedItems.find(
      (item) => item.youtubeUrl === youtubeUrl && Number(item.semitones) === Number(appliedSemitones)
    );
  }
  const title = processedItem?.title || processedItem?.fileName || processedItem?.label || '';
  const meta = processedItem?.metadata;
  const originalKey = meta?.key || youtubeKey || "";
  const transposedKey = originalKey && typeof transposeDetectedKey === 'function'
    ? transposeDetectedKey(originalKey, appliedSemitones)
    : "";

  const metaString = meta
    ? [
        meta.duration ? `⏱ ${formatDuration(meta.duration)}` : null,
        meta.sampleRate ? `${meta.sampleRate}Hz` : null,
        meta.channels ? `${meta.channels}ch` : null,
        meta.width && meta.height ? `${meta.width}x${meta.height}px` : null,
      ].filter(Boolean).join(' • ')
    : '';

  const semLabel = appliedSemitones !== 0
    ? `${appliedSemitones > 0 ? "+" : ""}${appliedSemitones} semitone${Math.abs(appliedSemitones) === 1 ? "" : "s"}`
    : "original";

  const activeKey = canAB && showOriginal ? originalKey : transposedKey;
  const baseLabel = [
    title || null,
    appliedSemitones !== 0
      ? (canAB && showOriginal ? "Original pitch" : `Transposed ${semLabel}`)
      : "Original playback",
    activeKey ? `Key: ${activeKey}` : null,
    metaString || null,
  ].filter(Boolean).join("  |  ");

  const ABToggle = canAB ? (
    <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 6px", gap: 0 }}>
      <div style={{
        display: "inline-flex",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "#1a1f2e",
      }}>
        {/* Original tab */}
        <button
          onClick={() => setShowOriginal(true)}
          className="ab-toggle-btn"
          style={{
            padding: "7px 18px",
            border: "none",
            borderRight: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "7px 0 0 7px",
            background: showOriginal ? "#1a2e48" : "transparent",
            color: showOriginal ? "#90cdf4" : "#718096",
            fontWeight: showOriginal ? 700 : 400,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            transition: "background 150ms, color 150ms",
          }}
          title="Listen to the original pitch"
        >
          {showOriginal && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#90cdf4", display: "inline-block", flexShrink: 0 }} />
          )}
          <span>
            <span style={{ fontSize: 10, opacity: 0.7, display: "block", lineHeight: 1, marginBottom: 1 }}>ORIGINAL</span>
            <span>{originalKey || "Original"}</span>
          </span>
        </button>

        {/* Transposed tab */}
        <button
          onClick={() => setShowOriginal(false)}
          className="ab-toggle-btn"
          style={{
            padding: "7px 18px",
            border: "none",
            borderRadius: "0 7px 7px 0",
            background: !showOriginal ? "#1a3d2b" : "transparent",
            color: !showOriginal ? "#9ae6b4" : "#718096",
            fontWeight: !showOriginal ? 700 : 400,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            transition: "background 150ms, color 150ms",
          }}
          title="Listen to the transposed pitch"
        >
          {!showOriginal && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#9ae6b4", display: "inline-block", flexShrink: 0 }} />
          )}
          <span>
            <span style={{ fontSize: 10, opacity: 0.7, display: "block", lineHeight: 1, marginBottom: 1 }}>TRANSPOSED {semLabel}</span>
            <span>{transposedKey || "Transposed"}</span>
          </span>
        </button>
      </div>
    </div>
  ) : null;

  const playerProps = {
    ref: mediaRef,
    src: activeSrc,
    playing,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    disabled: controlsDisabled,
    seekTo,
    label: baseLabel,
  };

  return (
    <>
      {file && isAudio(file) && (
        <>
          {ABToggle}
          <AudioPlayer {...playerProps} />
        </>
      )}
      {file && isVideo(file) && (
        <>
          {ABToggle}
          <VideoPlayer {...playerProps} />
        </>
      )}
      {youtubeUrl && transposedSrc && (
        <>
          {ABToggle}
          <AudioPlayer {...playerProps} />
        </>
      )}
    </>
  );
}

export default memo(PlayerSection);
