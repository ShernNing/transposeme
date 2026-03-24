import React, { useRef, useEffect } from "react";
import styles from "./AudioPlayer.module.css";

const AudioPlayer = ({ src, playing, onPlay, onPause, disabled, seekTo, label }) => {
  const audioRef = useRef();

  useEffect(() => {
    if (audioRef.current && seekTo != null) {
      audioRef.current.currentTime = seekTo;
    }
  }, [src, seekTo]);

  return (
    <div className={styles.audioPlayerContainer}>
      {label && <div className={styles.audioPlayerLabel}>{label}</div>}
      <audio
        ref={audioRef}
        src={src}
        controls
        autoPlay={playing}
        onPlay={onPlay}
        onPause={onPause}
        disabled={disabled}
        className={styles.audioPlayer}
      />
    </div>
  );
};

export default AudioPlayer;
