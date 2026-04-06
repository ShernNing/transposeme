import React, { memo, useState, useCallback } from "react";

const ENHARMONIC = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
  "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
};

function getFavKey(youtubeUrl, shift, mode) {
  return `fav::${youtubeUrl}::${shift}::${mode}`;
}

function loadFavourites() {
  try { return JSON.parse(localStorage.getItem("transpose_favourites") || "{}"); } catch { return {}; }
}

function KeySelector({
  youtubeKey,
  appliedSemitones,
  processing,
  isProcessingYouTube,
  handleTranspose,
  CHROMATIC_NOTES,
  CHROMATIC_NOTES_FLAT,
  NOTE_TO_INDEX,
  processedItems = [],
  youtubeUrl = "",
}) {
  const [favourites, setFavourites] = useState(loadFavourites);

  const toggleFavourite = useCallback((key) => {
    setFavourites((prev) => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; } else { next[key] = true; }
      localStorage.setItem("transpose_favourites", JSON.stringify(next));
      return next;
    });
  }, []);

  if (!youtubeKey) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ color: "#9ae6b4", fontWeight: 600, marginBottom: 4 }}>
        Select a key to transpose:
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        {["major", "minor"].map((mode) => (
          <div key={mode} style={{ margin: "0 8px" }}>
            <div style={{ color: "#a0aec0", fontSize: 12, marginBottom: 12, marginTop: -8, textAlign: "center" }}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </div>
            {CHROMATIC_NOTES.map((note, i) => {
              const prefersFlat = youtubeKey.includes("b");
              const noteName = prefersFlat ? CHROMATIC_NOTES_FLAT[i] : note;
              const label = `${noteName} ${mode}`;
              const enharmonic = ENHARMONIC[noteName];
              const [origRoot, ...origRest] = youtubeKey.trim().split(/\s+/);
              const origMode = origRest.join(" ").toLowerCase().includes("minor") ? "minor" : "major";
              const origIdx = NOTE_TO_INDEX[origRoot];
              const targetIdx = NOTE_TO_INDEX[note];
              let shift = null;
              if (origIdx != null && targetIdx != null && origMode === mode) {
                shift = (targetIdx - origIdx + 12) % 12;
                if (shift > 6) shift -= 12;
              }
              const isCurrent = shift !== null && shift === appliedSemitones && origMode === mode;
              const isOriginal = shift === 0 && origMode === mode;
              let hasBeenProcessed = false;
              if (processedItems && youtubeUrl && shift !== null && shift !== 0) {
                hasBeenProcessed = processedItems.some(item =>
                  item.isYouTube && item.youtubeUrl === youtubeUrl && Number(item.semitones) === shift
                );
              }
              const showDone = hasBeenProcessed && !isCurrent && !isOriginal;
              const favKey = getFavKey(youtubeUrl, shift, mode);
              const isFav = !!favourites[favKey];

              return (
                <div key={label} style={{ position: "relative", display: "inline-block", margin: 2 }}>
                  <button
                    disabled={shift === null || processing || isProcessingYouTube}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: isCurrent ? "2px solid #38a169" : isOriginal ? "2px solid #3182ce" : showDone ? "2px solid orange" : "1px solid #4a5568",
                      background: isCurrent ? "#22543d" : isOriginal ? "#2b4360" : showDone ? "#ff9800" : "#2d3748",
                      color: isCurrent ? "#9ae6b4" : isOriginal ? "#90cdf4" : showDone ? "#fff" : "#e2e8f0",
                      fontWeight: isCurrent || isOriginal || showDone ? 700 : 400,
                      opacity: shift === null ? 0.4 : 1,
                      cursor: shift === null ? "not-allowed" : "pointer",
                      minWidth: 64,
                    }}
                    onClick={() => shift !== null && handleTranspose(shift)}
                    title={
                      isOriginal ? "Original key"
                      : isCurrent ? "Currently playing key"
                      : showDone ? "Already processed key"
                      : enharmonic ? `${label} (also ${enharmonic} ${mode})`
                      : "Transpose to this key"
                    }
                    aria-label={`${label}${enharmonic ? ` / ${enharmonic} ${mode}` : ""}${isOriginal ? " (original)" : isCurrent ? " (playing)" : ""}`}
                    aria-pressed={isCurrent}
                  >
                    {label}
                    <span style={{ fontSize: 9, color: "#718096", marginLeft: 3, display: "block", lineHeight: 1, visibility: enharmonic ? "visible" : "hidden" }}>
                      {enharmonic ? `/${enharmonic}` : "/X"}
                    </span>
                  </button>
                  {/* Favourite star — only show when shift is valid and not null */}
                  {shift !== null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavourite(favKey); }}
                      title={isFav ? "Remove from favourites" : "Add to favourites"}
                      style={{
                        position: "absolute", top: -8, right: -8,
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 11, lineHeight: 1, padding: 0,
                        color: isFav ? "#f6e05e" : "#4a5568",
                      }}
                      aria-label={isFav ? "Remove favourite" : "Add favourite"}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  )}
                  {/* Labels above */}
                  {isOriginal && (
                    <span style={{ position: "absolute", top: -15, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "#63b3ed", fontWeight: 700, whiteSpace: "nowrap" }}>
                      Ori Key
                    </span>
                  )}
                  {isCurrent && !isOriginal && (
                    <span style={{ position: "absolute", top: -15, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "#68d391", fontWeight: 700, whiteSpace: "nowrap" }}>
                      Playing
                    </span>
                  )}
                  {showDone && (
                    <span style={{ position: "absolute", top: -15, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "orange", fontWeight: 700, whiteSpace: "nowrap" }}>
                      Done
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ color: "#a0aec0", fontSize: 11, marginTop: 6 }}>
        <span style={{ color: "#63b3ed", fontWeight: 700 }}>Orig</span> = Original key.{' '}
        <span style={{ color: "#68d391", fontWeight: 700 }}>Playing</span> = Current key.{' '}
        <span style={{ color: "orange", fontWeight: 700 }}>Done</span> = Already processed.{' '}
        <span style={{ color: "#f6e05e" }}>★</span> = Favourite. Enharmonic shown below each key.
      </div>
    </div>
  );
}

export default memo(KeySelector);
