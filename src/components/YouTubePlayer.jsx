import React from "react";

export default function YouTubePlayer({ url, show }) {
  if (!url || !show) return null;
  function getYouTubeVideoId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.replace("/", "");
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/shorts/")[1]?.split("/")[0] || "";
      }
      return parsed.searchParams.get("v") || "";
    } catch {
      return "";
    }
  }
  return (
    <div style={{ margin: "16px 0" }}>
      <div
        style={{
          position: "relative",
          paddingBottom: "56.25%",
          height: 0,
          overflow: "hidden",
          borderRadius: 8,
          background: "#000",
        }}
      >
        <iframe
          title="YouTube Player"
          src={`https://www.youtube.com/embed/${getYouTubeVideoId(url)}?autoplay=0&mute=1`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>
      <div
        style={{
          textAlign: "center",
          color: "#aaa",
          fontSize: 12,
          marginTop: 4,
        }}
      >
        Original YouTube video (before transposition)
      </div>
    </div>
  );
}
