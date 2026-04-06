import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import styles from "./VideoPlayer.module.css";
import { CONFIG } from "../utils/config";

const VideoPlayer = forwardRef(function VideoPlayer({ src, playing, onPlay, onPause, disabled, seekTo, label }, ref) {
  const videoRef = useRef();
  const [playbackRate, setPlaybackRate] = useState(1);

  // Expose the underlying <video> element via ref
  useImperativeHandle(ref, () => videoRef.current, []);

  useEffect(() => {
    if (videoRef.current && seekTo != null) {
      videoRef.current.currentTime = seekTo;
    }
  }, [src, seekTo]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  return (
    <div className={styles.videoPlayerContainer}>
      {label && <div className={styles.videoPlayerLabel}>{label}</div>}
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay={playing}
        onPlay={onPlay}
        onPause={onPause}
        disabled={disabled}
        className={styles.videoPlayer}
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

export default VideoPlayer;
