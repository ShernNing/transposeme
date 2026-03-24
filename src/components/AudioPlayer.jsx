import React, { useRef, useEffect } from "react";

const AudioPlayer = ({ src, playing, onPlay, onPause, disabled, seekTo }) => {
  const audioRef = useRef();

  useEffect(() => {
    if (audioRef.current && seekTo != null) {
      audioRef.current.currentTime = seekTo;
    }
  }, [src, seekTo]);

  return (
    <audio
      ref={audioRef}
      src={src}
      controls
      autoPlay={playing}
      onPlay={onPlay}
      onPause={onPause}
      disabled={disabled}
      style={{ width: "100%", margin: "12px 0" }}
    />
  );
};

export default AudioPlayer;
