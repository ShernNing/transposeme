import React, { memo, useState, useCallback } from "react";
import {
  CHROMATIC_NOTES,
  CHROMATIC_NOTES_FLAT,
  NOTE_TO_INDEX,
} from "../utils/constants";

const ENHARMONIC = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

function getFavKey(youtubeUrl, shift, mode) {
  return `fav::${youtubeUrl}::${shift}::${mode}`;
}

function loadFavourites() {
  try {
    return JSON.parse(localStorage.getItem("transpose_favourites") || "{}");
  } catch {
    return {};
  }
}

function KeySelector({
  youtubeKey,
  appliedSemitones,
  processing,
  isProcessingYouTube,
  handleTranspose,
  processedItems = [],
  youtubeUrl = "",
  showingOriginal = false,
}) {
  const [favourites, setFavourites] = useState(loadFavourites);

  const toggleFavourite = useCallback((key) => {
    setFavourites((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      localStorage.setItem("transpose_favourites", JSON.stringify(next));
      return next;
    });
  }, []);

  if (!youtubeKey) return null;

  const [origRoot, ...origRest] = youtubeKey.trim().split(/\s+/);
  const origMode = origRest.join(" ").toLowerCase().includes("minor")
    ? "minor"
    : "major";
  const origIdx = NOTE_TO_INDEX[origRoot];
  const prefersFlat = youtubeKey.includes("b");

  // What semitones are actually audible right now
  const effectiveSemitones = showingOriginal ? 0 : appliedSemitones;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ color: "#9ae6b4", fontWeight: 600, marginBottom: 4 }}>
        Select a key to transpose:
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {[origMode].map((mode) => (
          <div key={mode} style={{ margin: "0 8px" }}>
            <div
              style={{
                color: "#a0aec0",
                fontSize: 12,
                marginBottom: 2,
                marginTop: 2,
                textAlign: "center",
              }}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </div>
            {CHROMATIC_NOTES.map((note, i) => {
              const noteName = prefersFlat ? CHROMATIC_NOTES_FLAT[i] : note;
              const label = `${noteName} ${mode}`;
              const enharmonic = ENHARMONIC[noteName];
              const targetIdx = NOTE_TO_INDEX[note];
              let shift = null;
              if (origIdx != null && targetIdx != null) {
                shift = (targetIdx - origIdx + 12) % 12;
                if (shift > 6) shift -= 12;
              }

              // Key currently audible (reflects A/B toggle)
              const isPlaying = shift !== null && shift === effectiveSemitones;
              // Key selected/applied but listening to original via A/B toggle
              const isSelectedNotPlaying =
                showingOriginal &&
                shift !== null &&
                shift === appliedSemitones &&
                appliedSemitones !== 0;
              const isOriginal = shift === 0;
              let hasBeenProcessed = false;
              if (
                processedItems &&
                youtubeUrl &&
                shift !== null &&
                shift !== 0
              ) {
                hasBeenProcessed = processedItems.some(
                  (item) =>
                    item.isYouTube &&
                    item.youtubeUrl === youtubeUrl &&
                    Number(item.semitones) === shift,
                );
              }
              const showDone =
                hasBeenProcessed &&
                !isPlaying &&
                !isSelectedNotPlaying &&
                !isOriginal;
              const favKey = getFavKey(youtubeUrl, shift, mode);
              const isFav = !!favourites[favKey];

              const tooltipText =
                isPlaying && isOriginal
                  ? "Original key — currently playing"
                  : isPlaying
                    ? "Currently playing"
                    : isSelectedNotPlaying
                      ? "Selected key (listening to original via A/B toggle)"
                      : isOriginal
                        ? "Original key — click to return to original"
                        : showDone
                          ? "Already processed — click to reload"
                          : enharmonic
                            ? `${label} (also ${enharmonic} ${mode})`
                            : `Transpose to ${label}`;

              const borderColor = isPlaying
                ? "#38a169"
                : isSelectedNotPlaying
                  ? "#d69e2e"
                  : isOriginal
                    ? "#3182ce"
                    : showDone
                      ? "#805ad5"
                      : "transparent";
              const bgColor = isPlaying
                ? "#1a3d2b"
                : isSelectedNotPlaying
                  ? "#2d2300"
                  : isOriginal
                    ? "#1a2e48"
                    : showDone
                      ? "#2d2048"
                      : "#2d3748";
              const textColor = isPlaying
                ? "#9ae6b4"
                : isSelectedNotPlaying
                  ? "#f6c90e"
                  : isOriginal
                    ? "#90cdf4"
                    : showDone
                      ? "#b794f4"
                      : "#e2e8f0";
              const borderWidth =
                isPlaying || isSelectedNotPlaying || isOriginal || showDone
                  ? "2px"
                  : "1px";

              return (
                <div
                  key={label}
                  style={{
                    position: "relative",
                    display: "inline-block",
                    margin: 2,
                  }}
                >
                  <button
                    disabled={
                      shift === null || processing || isProcessingYouTube
                    }
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: `${borderWidth} solid ${borderColor === "transparent" ? "#4a5568" : borderColor}`,
                      background: bgColor,
                      color: textColor,
                      fontWeight:
                        isPlaying || isOriginal || isSelectedNotPlaying
                          ? 700
                          : 400,
                      opacity: shift === null ? 0.35 : 1,
                      cursor: shift === null ? "not-allowed" : "pointer",
                      minWidth: 64,
                      fontSize: 12,
                    }}
                    onClick={() => shift !== null && handleTranspose(shift)}
                    title={tooltipText}
                    aria-label={`${label}${enharmonic ? ` / ${enharmonic} ${mode}` : ""}${isOriginal ? " (original)" : isPlaying ? " (playing)" : isSelectedNotPlaying ? " (selected)" : ""}`}
                    aria-pressed={isPlaying}
                  >
                    {label}
                    {enharmonic && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "#718096",
                          marginLeft: 3,
                          display: "block",
                          lineHeight: 1,
                        }}
                      >
                        /{enharmonic}
                      </span>
                    )}
                  </button>
                  {shift !== null && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavourite(favKey);
                      }}
                      title={
                        isFav ? "Remove from favourites" : "Add to favourites"
                      }
                      style={{
                        position: "absolute",
                        top: -7,
                        right: -7,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 11,
                        lineHeight: 1,
                        padding: 0,
                        color: isFav ? "#f6e05e" : "#4a5568",
                      }}
                      aria-label={isFav ? "Remove favourite" : "Add favourite"}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div
        style={{
          color: "#718096",
          fontSize: 11,
          marginTop: 8,
          display: "flex",
          gap: 14,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#1a2e48",
              border: "2px solid #3182ce",
              marginRight: 4,
              verticalAlign: "middle",
            }}
          />
          Original
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#1a3d2b",
              border: "2px solid #38a169",
              marginRight: 4,
              verticalAlign: "middle",
            }}
          />
          Playing
        </span>
        {showingOriginal && appliedSemitones !== 0 && (
          <span>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                background: "#2d2300",
                border: "2px solid #d69e2e",
                marginRight: 4,
                verticalAlign: "middle",
              }}
            />
            Selected
          </span>
        )}
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#2d2048",
              border: "2px solid #805ad5",
              marginRight: 4,
              verticalAlign: "middle",
            }}
          />
          Done
        </span>
        <span>
          <span style={{ color: "#f6e05e" }}>★</span> Favourite
        </span>
      </div>
    </div>
  );
}

export default memo(KeySelector);
