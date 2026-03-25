import React from "react";

export default function YouTubeKeyAnalysis({
  youtubeUrl,
  isAnalyzingKey,
  isProcessingYouTube,
  handleAnalyzeKey,
  handleReanalyzeKey,
  keyFeedback,
  keyAnalyzeDots,
  youtubeKey,
  children,
}) {
  if (!youtubeUrl) return null;
  // Decide button label and handler
  let buttonLabel = "Analyze song key";
  let buttonTitle = "Analyze the song key from audio";
  let buttonHandler = handleAnalyzeKey;
  if (youtubeKey) {
    buttonLabel = "Re-analyze Key";
    buttonTitle = "Force re-analyze the song key and update history";
    buttonHandler = handleReanalyzeKey;
  }
  if (isAnalyzingKey) {
    buttonLabel = (
      <>
        <span style={{ marginRight: 8 }}>Analyzing key...</span>
        <span className="spinner" style={{ verticalAlign: "middle", marginLeft: 2 }}>
          <svg width="16" height="16" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="18" stroke="#f6e05e" strokeWidth="4" opacity="0.18" /><path d="M40 22a18 18 0 0 1-18 18" stroke="#f6e05e" strokeWidth="4" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.8s" repeatCount="indefinite" /></path></svg>
        </span>
      </>
    );
    buttonTitle = "Key analysis in progress...";
  } else if (isProcessingYouTube) {
    buttonLabel = "Processing...";
    buttonTitle = "Wait for YouTube processing to finish before analyzing key.";
  }
  return (
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        <button
          onClick={buttonHandler}
          disabled={isAnalyzingKey || isProcessingYouTube}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "none",
            background: isAnalyzingKey ? "#b7791f" : isProcessingYouTube ? "#4a5568" : "#2d3748",
            color: "#fff",
            position: "relative",
            cursor: isAnalyzingKey || isProcessingYouTube ? "not-allowed" : "pointer",
          }}
          title={buttonTitle}
        >
          {buttonLabel}
        </button>
      </div>
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
