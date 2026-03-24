import React, { useRef, useEffect } from "react";

const VideoPlayer = ({ src, playing, onPlay, onPause, disabled, seekTo }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && seekTo != null) {
      videoRef.current.currentTime = seekTo;
    }
  }, [src, seekTo]);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      autoPlay={playing}
      onPlay={onPlay}
      onPause={onPause}
      disabled={disabled}
      style={{ width: "100%", margin: "12px 0", background: "#000" }}
    />
  );
};

export default VideoPlayer;
