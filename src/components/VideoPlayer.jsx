import React, { useRef, useEffect } from "react";
import styles from "./VideoPlayer.module.css";

const VideoPlayer = ({ src, playing, onPlay, onPause, disabled, seekTo, label }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && seekTo != null) {
      videoRef.current.currentTime = seekTo;
    }
  }, [src, seekTo]);

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
    </div>
  );
};

export default VideoPlayer;
