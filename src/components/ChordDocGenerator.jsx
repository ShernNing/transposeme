
import { useState, useRef } from "react";
import { fetchAllChordSheets } from "../utils/chordFetchers";
import { generateDocx, generatePdf } from "../utils/docExport";
import { transposeChordSheet } from "../utils/wasmTransposer";

// Simple heuristic to guess key from chord text
function guessKeyFromChordText(chordText) {
  // Look for the first chord line (e.g., C G Am F)
  const lines = chordText.split(/\r?\n/);
  for (let line of lines) {
    // Only consider lines with at least 2 chords
    const matches = line.match(/([A-G][#b]?m?(aj7|m7|7|sus[24]?|dim|aug)?)/g);
    if (matches && matches.length >= 2) {
      // Return the first chord as a guess
      return matches[0].replace(/[^A-G#b]/g, "");
    }
  }
  return "";
}

function useChordFetcher(songTitle, artist, selectedKey) {
  const [chordSource, setChordSource] = useState(null); // 'auto', 'manual', or null
  const [chordText, setChordText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [originalKey, setOriginalKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [allOptions, setAllOptions] = useState([]); // [{source, text, url, title}]
  const [selectedIdx, setSelectedIdx] = useState(null);

  const canGenerate = songTitle && selectedKey;

  const handleGenerate = async () => {
    setError("");
    setFetching(true);
    setChordSource(null);
    setChordText("");
    setAllOptions([]);
    setSelectedIdx(null);
    setConfirmed(false);
    setOriginalKey(selectedKey || "");
    try {
      const results = await fetchAllChordSheets({ songTitle, artist });
      if (results && results.length > 0) {
        setAllOptions(results);
        setChordSource("select");
      } else {
        setChordSource("manual");
        setError("Could not fetch chords automatically. Please paste or upload the chord sheet.");
      }
    } catch (e) {
      setChordSource("manual");
      setError("Error fetching chords. Please paste or upload the chord sheet.");
    } finally {
      setFetching(false);
    }
  };

  const confirmFetched = () => {
    if (selectedIdx != null && allOptions[selectedIdx]) {
      // Transpose the chord sheet to the selected key if needed
      const original = allOptions[selectedIdx];
      let detectedKey = original.key;
      if (!detectedKey) {
        detectedKey = guessKeyFromChordText(original.text);
      }
      setOriginalKey(detectedKey);
      let transposedText = original.text;
      if (detectedKey && selectedKey && detectedKey !== selectedKey) {
        try {
          transposedText = transposeChordSheet(original.text, detectedKey, selectedKey);
        } catch (e) {
          setError("Could not transpose chords to selected key. Showing original.");
        }
      }
      setChordText(transposedText);
      setChordSource("auto");
      setConfirmed(true);
    }
  };
  const rejectFetched = () => {
    setChordSource("manual");
    setConfirmed(false);
    setError("Please paste or upload the correct chord sheet.");
  };

  return {
    chordSource,
    chordText,
    setChordText,
    fetching,
    error,
    canGenerate,
    handleGenerate,
    allOptions,
    selectedIdx,
    setSelectedIdx,
    confirmed,
    confirmFetched,
    rejectFetched,
    originalKey,
    setOriginalKey,
  };
}


// Main component: accepts songTitle, artist, and selectedKey as props
export default function ChordDocGenerator({ songTitle, artist, selectedKey }) {
  const {
    chordSource,
    chordText,
    setChordText,
    fetching,
    error,
    canGenerate,
    handleGenerate,
    allOptions,
    selectedIdx,
    setSelectedIdx,
    confirmed,
    confirmFetched,
    rejectFetched,
    originalKey,
    setOriginalKey,
  } = useChordFetcher(songTitle, artist, selectedKey);

  return (
    <div style={{ margin: "32px 0", padding: 24, background: "#23272e", borderRadius: 8 }}>
      <h2 style={{ color: "#f6e05e" }}>Generate Chord Sheet Document</h2>
      <div style={{ marginBottom: 12 }}>
        <b>Song:</b> {songTitle || <span style={{ color: '#a0aec0' }}>Not set</span>}<br/>
        <b>Key:</b> {selectedKey || <span style={{ color: '#a0aec0' }}>Not set</span>}
        {originalKey && (
          <span style={{ color: '#90cdf4', marginLeft: 12 }}>
            (Detected original key: {originalKey})
          </span>
        )}
      </div>
      <button
        onClick={handleGenerate}
        disabled={!canGenerate || fetching}
        style={{
          background: canGenerate && !fetching ? "#9ae6b4" : "#4a5568",
          color: "#23272e",
          fontWeight: 700,
          fontSize: 16,
          padding: "10px 24px",
          border: "none",
          borderRadius: 6,
          cursor: canGenerate && !fetching ? "pointer" : "not-allowed",
          marginBottom: 16,
        }}
      >
        {fetching ? "Fetching..." : "Generate Chord Sheet"}
      </button>
      {chordSource === "select" && allOptions.length > 0 && (
        <div style={{ color: "#9ae6b4", marginBottom: 8 }}>
          <div style={{ marginBottom: 8 }}>Select a chord sheet to use:</div>
          {allOptions.map((opt, idx) => (
            <div key={idx} style={{ border: selectedIdx === idx ? '2px solid #f6e05e' : '1px solid #4a5568', borderRadius: 6, marginBottom: 12, padding: 10, background: '#1a202c' }}>
              <div><b>{opt.source}</b>{opt.title ? <> — <span style={{ color: '#fff' }}>{opt.title}</span></> : null}</div>
              {opt.url && <div><a href={opt.url} target="_blank" rel="noopener noreferrer" style={{ color: "#63b3ed" }}>View Source</a></div>}
              <button onClick={() => setSelectedIdx(idx)} style={{ marginTop: 6, background: selectedIdx === idx ? '#f6e05e' : '#68d391', color: '#23272e', fontWeight: 700, border: 'none', borderRadius: 4, padding: '4px 14px', cursor: 'pointer' }}>Select</button>
              {selectedIdx === idx && (
                <div style={{ marginTop: 10, background: '#23272e', padding: 8, borderRadius: 4, color: '#fff', fontFamily: 'monospace', fontSize: 14, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{opt.text}</div>
              )}
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <button onClick={confirmFetched} disabled={selectedIdx == null} style={{ marginRight: 12, background: '#68d391', color: '#23272e', fontWeight: 700, border: 'none', borderRadius: 4, padding: '6px 18px', cursor: selectedIdx == null ? 'not-allowed' : 'pointer' }}>Use Selected</button>
            <button onClick={rejectFetched} style={{ background: '#f56565', color: '#fff', fontWeight: 700, border: 'none', borderRadius: 4, padding: '6px 18px', cursor: 'pointer' }}>Reject All</button>
          </div>
        </div>
      )}
      {error && <div style={{ color: "#f56565", marginBottom: 12 }}>{error}</div>}
      {(chordSource === "manual" || (chordSource === "auto" && confirmed)) && (
        <ChordSheetExport
          title={songTitle}
          keyLabel={selectedKey}
          chordText={chordText}
          originalKey={originalKey}
          setOriginalKey={setOriginalKey}
        />
      )}
    </div>
  );
}

// Export/Preview subcomponent (must be outside main component)
// (no duplicate import)
function ChordSheetExport({ title, keyLabel, chordText, originalKey, setOriginalKey }) {
  const [previewType, setPreviewType] = useState("text"); // "text", "docx", "pdf"
  const [generating, setGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadType, setDownloadType] = useState(null);
  const previewRef = useRef();

  const handleDownload = async (type) => {
    setGenerating(true);
    setDownloadType(type);
    let blob;
    if (type === "docx") {
      blob = await generateDocx({ title, key: originalKey || keyLabel, chordText });
    } else if (type === "pdf") {
      blob = await generatePdf({ title, key: originalKey || keyLabel, chordText });
    }
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    setGenerating(false);
    setTimeout(() => URL.revokeObjectURL(url), 60000); // Clean up after 1 min
  };

  return (
    <div style={{ marginTop: 16 }}>
      <label style={{ color: "#9ae6b4", fontWeight: 600 }}>
        Paste Chord Sheet (chords above lyrics):
      </label>
      <textarea
        value={chordText}
        onChange={e => {/* not editable if exporting from auto, but keep for manual */}}
        rows={12}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 15, marginTop: 8, borderRadius: 6, padding: 8 }}
        readOnly
      />
      <div style={{ marginTop: 16 }}>
        <label style={{ color: "#f6e05e", fontWeight: 600, marginRight: 8 }}>
          Original Key of Chord Sheet:
        </label>
        <input
          type="text"
          value={originalKey}
          onChange={e => setOriginalKey(e.target.value)}
          style={{ fontSize: 15, borderRadius: 4, padding: '4px 10px', width: 120 }}
          placeholder="e.g. G, C, F# minor"
        />
        <span style={{ color: '#a0aec0', marginLeft: 8, fontSize: 13 }}>
          (Set this to the key of the fetched chord sheet)
        </span>
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 16 }}>
        <button onClick={() => handleDownload("docx")}
          disabled={generating}
          style={{ background: '#f6e05e', color: '#23272e', fontWeight: 700, border: 'none', borderRadius: 4, padding: '8px 18px', cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating && downloadType === "docx" ? "Generating..." : "Download .docx"}
        </button>
        <button onClick={() => handleDownload("pdf")}
          disabled={generating}
          style={{ background: '#68d391', color: '#23272e', fontWeight: 700, border: 'none', borderRadius: 4, padding: '8px 18px', cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating && downloadType === "pdf" ? "Generating..." : "Download PDF"}
        </button>
        {downloadUrl && (
          <a href={downloadUrl} download={downloadType === "docx" ? `${title || 'chord-sheet'}.docx` : `${title || 'chord-sheet'}.pdf`} style={{ marginLeft: 12, color: '#3182ce', fontWeight: 700 }}>
            Click to Save {downloadType === "docx" ? ".docx" : "PDF"}
          </a>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <label style={{ color: '#f6e05e', fontWeight: 600, marginRight: 12 }}>Preview:</label>
        <span style={{ color: '#a0aec0', fontSize: 13 }}>(Preview is plain text; download for full formatting)</span>
        <pre ref={previewRef} style={{ background: '#1a202c', color: '#fff', fontFamily: 'monospace', fontSize: 15, padding: 12, borderRadius: 6, marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
{title}
Key: {originalKey || keyLabel}
{chordText}
        </pre>
      </div>
    </div>
  );
}
