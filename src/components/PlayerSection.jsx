import React from "react";

export default function PlayerSection({
  file,
  youtubeUrl,
  transposedSrc,
  playing,
  setPlaying,
  processing,
  isProcessingYouTube,
  seekTo,
  semitones,
  appliedSemitones,
  processedItems = [],
  ...audioVideoProps
}) {
  const { isAudio, isVideo } = audioVideoProps;

  // Find metadata for current file/youtubeUrl
  let processedItem = null;
  if (file) {
    processedItem = processedItems.find(
      (item) => item.fileName === file.name && item.semitones === semitones
    );
  } else if (youtubeUrl) {
    processedItem = processedItems.find(
      (item) => item.youtubeUrl === youtubeUrl && item.semitones === semitones
    );
  }
  const title = processedItem?.title || processedItem?.fileName || processedItem?.label || '';
  const meta = processedItem?.metadata;

  function formatDuration(seconds) {
    if (!isFinite(seconds)) return '';
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString();
    const h = Math.floor(seconds / 3600);
    if (h > 0) return `${h}:${m.padStart(2, '0')}:${s}`;
    return `${m}:${s}`;
  }

  const metaString = meta
    ? [
        meta.duration ? `⏱ ${formatDuration(meta.duration)}` : null,
        meta.sampleRate ? `${meta.sampleRate}Hz` : null,
        meta.channels ? `${meta.channels}ch` : null,
        meta.width && meta.height ? `${meta.width}x${meta.height}px` : null,
      ]
        .filter(Boolean)
        .join(' • ')
    : '';

  let audioLabel = '';
  if (file && isAudio(file)) {
    audioLabel =
      (title ? `${title}  |  ` : '') +
      (semitones !== 0
        ? `Transposed: ${semitones > 0 ? "+" : ""}${semitones} semitone${Math.abs(semitones) === 1 ? "" : "s"}`
        : "Original playback") + (metaString ? `  |  ${metaString}` : "");
  }
  let videoLabel = '';
  if (file && isVideo(file)) {
    videoLabel =
      (title ? `${title}  |  ` : '') +
      (semitones !== 0
        ? `Transposed: ${semitones > 0 ? "+" : ""}${semitones} semitone${Math.abs(semitones) === 1 ? "" : "s"}`
        : "Original playback") + (metaString ? `  |  ${metaString}` : "");
  }
  let ytLabel = '';
  if (youtubeUrl && transposedSrc) {
    ytLabel =
      (title ? `${title}  |  ` : '') +
      `Transposed playback: ${semitones > 0 ? "+" : ""}${semitones} semitone${Math.abs(semitones) === 1 ? "" : "s"}` +
      (metaString ? `  |  ${metaString}` : "");
  }

  return (
    <>
      {file && isAudio(file) && (
        <audioVideoProps.AudioPlayer
          src={transposedSrc}
          playing={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          disabled={processing || isProcessingYouTube}
          seekTo={seekTo}
          label={audioLabel}
        />
      )}
      {file && isVideo(file) && (
        <audioVideoProps.VideoPlayer
          src={transposedSrc}
          playing={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          disabled={processing || isProcessingYouTube}
          seekTo={seekTo}
          label={videoLabel}
        />
      )}
      {/* Show transposed audio player for YouTube audio result */}
      {youtubeUrl && transposedSrc && (
        <audioVideoProps.AudioPlayer
          src={transposedSrc}
          playing={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          disabled={processing || isProcessingYouTube}
          seekTo={seekTo}
          label={ytLabel}
        />
      )}
    </>
  );
}
