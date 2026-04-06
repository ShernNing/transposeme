import React, { useState, memo } from "react";

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
  transposeDetectedKey,
  mediaRef,
  ...audioVideoProps
}) {
  const { isAudio, isVideo } = audioVideoProps;
  const [showOriginal, setShowOriginal] = useState(false);

  // Only show A/B toggle when we have both original and transposed and semitones ≠ 0
  const canAB = originalSrc && transposedSrc && semitones !== 0;
  const activeSrc = canAB && showOriginal ? originalSrc : transposedSrc;

  // Find metadata for current file/youtubeUrl
  let processedItem = null;
  if (file) {
    processedItem = processedItems.find(
      (item) => item.fileName === file.name && Number(item.semitones) === Number(semitones)
    );
  } else if (youtubeUrl) {
    processedItem = processedItems.find(
      (item) => item.youtubeUrl === youtubeUrl && Number(item.semitones) === Number(semitones)
    );
  }
  const title = processedItem?.title || processedItem?.fileName || processedItem?.label || '';
  const meta = processedItem?.metadata;
  const originalKey = meta?.key || youtubeKey || "";
  const currentKey = originalKey && typeof transposeDetectedKey === 'function'
    ? transposeDetectedKey(originalKey, semitones)
    : "";

  const metaString = meta
    ? [
        meta.duration ? `⏱ ${formatDuration(meta.duration)}` : null,
        meta.sampleRate ? `${meta.sampleRate}Hz` : null,
        meta.channels ? `${meta.channels}ch` : null,
        meta.width && meta.height ? `${meta.width}x${meta.height}px` : null,
      ].filter(Boolean).join(' • ')
    : '';

  function labelWithKey(base, key) {
    return key ? `${base}  |  Key: ${key}` : base;
  }

  const semLabel = semitones !== 0
    ? `Transposed: ${semitones > 0 ? "+" : ""}${semitones} semitone${Math.abs(semitones) === 1 ? "" : "s"}`
    : "Original playback";

  const baseLabel = (title ? `${title}  |  ` : '') + semLabel + (metaString ? `  |  ${metaString}` : '');

  const ABToggle = canAB ? (
    <div style={{ textAlign: "center", margin: "6px 0" }}>
      <button
        onClick={() => setShowOriginal((v) => !v)}
        style={{
          background: showOriginal ? "#2b4360" : "#22543d",
          color: showOriginal ? "#90cdf4" : "#9ae6b4",
          border: "none",
          borderRadius: 6,
          padding: "5px 16px",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
        title="Toggle between original and transposed audio"
      >
        {showOriginal ? "🔁 Hearing: Original — click for Transposed" : "🔁 Hearing: Transposed — click for Original"}
      </button>
    </div>
  ) : null;

  return (
    <>
      {file && isAudio(file) && (
        <>
          {ABToggle}
          <audioVideoProps.AudioPlayer
            ref={mediaRef}
            src={activeSrc}
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            disabled={controlsDisabled}
            seekTo={seekTo}
            label={labelWithKey(canAB && showOriginal ? (title ? `${title}  |  Original` : "Original") : baseLabel, canAB && showOriginal ? originalKey : currentKey)}
          />
        </>
      )}
      {file && isVideo(file) && (
        <>
          {ABToggle}
          <audioVideoProps.VideoPlayer
            ref={mediaRef}
            src={activeSrc}
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            disabled={controlsDisabled}
            seekTo={seekTo}
            label={labelWithKey(canAB && showOriginal ? (title ? `${title}  |  Original` : "Original") : baseLabel, canAB && showOriginal ? originalKey : currentKey)}
          />
        </>
      )}
      {youtubeUrl && transposedSrc && (
        <>
          {ABToggle}
          <audioVideoProps.AudioPlayer
            ref={mediaRef}
            src={activeSrc}
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            disabled={controlsDisabled}
            seekTo={seekTo}
            label={labelWithKey(canAB && showOriginal ? (title ? `${title}  |  Original` : "Original") : baseLabel, canAB && showOriginal ? originalKey : currentKey)}
          />
        </>
      )}
    </>
  );
}

export default memo(PlayerSection);
