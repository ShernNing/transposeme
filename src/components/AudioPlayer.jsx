import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import styles from "./AudioPlayer.module.css";
import { CONFIG } from "../utils/config";
import AudioWaveform from "./AudioWaveform";

const AudioPlayer = forwardRef(function AudioPlayer({ src, playing, onPlay, onPause, disabled, seekTo, label }, ref) {
  const audioRef = useRef();
  const currentTimeRef = useRef(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useImperativeHandle(ref, () => audioRef.current, []);

  // A/B toggle: src changes but seekTo doesn't — restore last known position
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = currentTimeRef.current;
    }
  }, [src]);

  // Explicit seek after transpose: seekTo changes — jump to that position
  useEffect(() => {
    if (audioRef.current && seekTo != null) {
      audioRef.current.currentTime = seekTo;
      currentTimeRef.current = seekTo;
    }
  }, [seekTo]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  return (
    <div className={styles.audioPlayerContainer}>
      {label && <div className={styles.audioPlayerLabel}>{label}</div>}
      <AudioWaveform audioRef={audioRef} playing={playing} />
      <audio
        ref={audioRef}
        src={src}
        controls
        autoPlay={playing}
        onPlay={onPlay}
        onPause={onPause}
        onTimeUpdate={() => { currentTimeRef.current = audioRef.current?.currentTime ?? 0; }}
        disabled={disabled}
        className={styles.audioPlayer}
      />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span style={{ color: "#a0aec0", fontSize: 12 }}>Speed:</span>
        {CONFIG.PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            onClick={() => setPlaybackRate(rate)}
            disabled={disabled}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              border: playbackRate === rate ? "2px solid #9ae6b4" : "1px solid #4a5568",
              background: playbackRate === rate ? "#22543d" : "#2d3748",
              color: playbackRate === rate ? "#9ae6b4" : "#e2e8f0",
              fontSize: 12,
              fontWeight: playbackRate === rate ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {rate}×
          </button>
        ))}
      </div>
    </div>
  );
});

export default AudioPlayer;
