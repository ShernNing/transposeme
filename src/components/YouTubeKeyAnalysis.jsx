import React from "react";

export default function YouTubeKeyAnalysis({
  youtubeUrl,
  isAnalyzingKey,
  isProcessingYouTube,
  handleAnalyzeKey,
  keyFeedback,
  keyAnalyzeDots,
  youtubeKey,
  children,
}) {
  if (!youtubeUrl) return null;
  return (
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      <button
        onClick={handleAnalyzeKey}
        disabled={isAnalyzingKey || isProcessingYouTube}
        style={{
          padding: "6px 10px",
          borderRadius: 4,
          border: "none",
          background: "#2d3748",
          color: "#fff",
        }}
      >
        {isAnalyzingKey ? "Analyzing key..." : "Analyze song key"}
      </button>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: isAnalyzingKey ? "#f6e05e" : youtubeKey ? "#9ae6b4" : "#a0aec0",
        }}
      >
        {keyFeedback}
      </div>
      {isAnalyzingKey && (
        <div
          style={{
            marginTop: 6,
            padding: "6px 10px",
            borderRadius: 6,
            background: "#3b3415",
            border: "1px solid #d69e2e",
            color: "#f6e05e",
            fontSize: 12,
            display: "inline-block",
          }}
        >
          Analyzing song key{keyAnalyzeDots}
        </div>
      )}
      {children}
    </div>
  );
}
