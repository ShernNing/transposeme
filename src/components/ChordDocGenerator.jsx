
import { useState, useRef } from "react";
import { fetchFromChordVault, fetchWebChordSheets, CHORDVAULT_APP_URL } from "../utils/chordFetchers";
import { generateDocx, generatePdf } from "../utils/docExport";
import { transposeChordSheet } from "../utils/wasmTransposer";

function guessKeyFromChordText(chordText) {
  const lines = chordText.split(/\r?\n/);
  for (let line of lines) {
    const matches = line.match(/([A-G][#b]?m?(aj7|m7|7|sus[24]?|dim|aug)?)/g);
    if (matches && matches.length >= 2) {
      return matches[0].replace(/[^A-G#b]/g, "");
    }
  }
  return "";
}

function applyTranspose(text, fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return text;
  try {
    return transposeChordSheet(text, fromKey, toKey);
  } catch {
    return text;
  }
}

function useChordFetcher(songTitle, artist, selectedKey) {
  const [chordSource, setChordSource] = useState(null);
  const [chordText, setChordText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchStep, setFetchStep] = useState(""); // human-readable status
  const [error, setError] = useState("");
  const [originalKey, setOriginalKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [allOptions, setAllOptions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [chordVaultUrl, setChordVaultUrl] = useState(null);

  const canGenerate = songTitle && selectedKey;

  const handleGenerate = async () => {
    setError("");
    setFetching(true);
    setFetchStep("");
    setChordSource(null);
    setChordText("");
    setAllOptions([]);
    setSelectedIdx(null);
    setConfirmed(false);
    setOriginalKey("");
    setChordVaultUrl(null);

    try {
      // 1. Search ChordVault first
      setFetchStep("Checking ChordVault library...");
      const cvResults = await fetchFromChordVault(songTitle);
      if (cvResults && cvResults.length > 0) {
        const best = cvResults[0];
        const detectedKey = best.key || guessKeyFromChordText(best.text);
        const transposed = applyTranspose(best.text, detectedKey, selectedKey);
        setOriginalKey(detectedKey);
        setChordText(transposed);
        setChordVaultUrl(best.url);
        setChordSource("auto");
        setConfirmed(true);
        setFetchStep("");
        setFetching(false);
        return;
      }

      // 2. Fall back to web scraping
      setFetchStep("Searching web sources...");
      const results = await fetchWebChordSheets({ songTitle, artist });
      if (results && results.length > 0) {
        setAllOptions(results);
        setChordSource("select");
      } else {
        setChordSource("manual");
        setError("Could not fetch chords automatically. Please paste the chord sheet.");
      }
    } catch (e) {
      setChordSource("manual");
      setError("Error fetching chords. Please paste the chord sheet.");
    } finally {
      setFetching(false);
      setFetchStep("");
    }
  };

  const confirmFetched = () => {
    if (selectedIdx == null || !allOptions[selectedIdx]) return;
    const original = allOptions[selectedIdx];
    const detectedKey = original.key || guessKeyFromChordText(original.text);
    setOriginalKey(detectedKey);
    setChordText(applyTranspose(original.text, detectedKey, selectedKey));
    setChordSource("auto");
    setConfirmed(true);
  };

  const rejectFetched = () => {
    setChordSource("manual");
    setConfirmed(false);
    setError("Please paste the correct chord sheet below.");
  };

  return {
    chordSource, chordText, setChordText, fetching, fetchStep, error,
    canGenerate, handleGenerate, allOptions, selectedIdx, setSelectedIdx,
    confirmed, confirmFetched, rejectFetched, originalKey, setOriginalKey,
    chordVaultUrl,
  };
}


export default function ChordDocGenerator({ songTitle, artist, selectedKey }) {
  const {
    chordSource, chordText, setChordText, fetching, fetchStep, error,
    canGenerate, handleGenerate, allOptions, selectedIdx, setSelectedIdx,
    confirmed, confirmFetched, rejectFetched, originalKey, setOriginalKey,
    chordVaultUrl,
  } = useChordFetcher(songTitle, artist, selectedKey);

  return (
    <div style={{ margin: "32px 0", padding: 24, background: "#23272e", borderRadius: 8 }}>
      <h2 style={{ color: "#f6e05e" }}>Generate Chord Sheet Document</h2>
      <div style={{ marginBottom: 12 }}>
        <b>Song:</b> {songTitle || <span style={{ color: '#a0aec0' }}>Not set</span>}<br/>
        <b>Key:</b> {selectedKey || <span style={{ color: '#a0aec0' }}>Not set</span>}
        {originalKey && (
          <span style={{ color: '#90cdf4', marginLeft: 12 }}>
            (Original key: {originalKey})
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
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
          }}
        >
          Generate Chord Sheet
        </button>
        {fetchStep && (
          <span style={{ color: '#90cdf4', fontSize: 13 }}>{fetchStep}</span>
        )}
      </div>

      {/* ChordVault match banner */}
      {chordVaultUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 14px', background: '#1a365d', borderRadius: 6, border: '1px solid #2b6cb0' }}>
          <span style={{ color: '#90cdf4', fontSize: 14 }}>✓ Found in your ChordVault library</span>
          <a
            href={chordVaultUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#63b3ed', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
          >
            Open in ChordVault ↗
          </a>
        </div>
      )}

      {/* Web source picker (fallback) */}
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
          artist={artist}
          keyLabel={selectedKey}
          chordText={chordText}
          setChordText={setChordText}
          originalKey={originalKey}
          setOriginalKey={setOriginalKey}
          chordVaultUrl={chordVaultUrl}
        />
      )}
    </div>
  );
}

function ChordSheetExport({ title, artist, keyLabel, chordText, setChordText, originalKey, setOriginalKey, chordVaultUrl }) {
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
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const chordVaultHref = chordVaultUrl
    ? chordVaultUrl
    : chordText
      ? `${CHORDVAULT_APP_URL}/songs/new?${new URLSearchParams({
          title: title || "",
          artist: artist || "",
          key: originalKey || keyLabel || "",
          content: chordText,
        }).toString()}`
      : null;

  const chordVaultLabel = chordVaultUrl ? "Open in ChordVault ↗" : "Save to ChordVault ↗";

  return (
    <div style={{ marginTop: 16 }}>
      <label style={{ color: "#9ae6b4", fontWeight: 600 }}>
        Chord Sheet:
      </label>
      <textarea
        value={chordText}
        onChange={e => setChordText(e.target.value)}
        rows={12}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 15, marginTop: 8, borderRadius: 6, padding: 8 }}
        placeholder="Paste chord sheet here..."
      />
      <div style={{ marginTop: 16 }}>
        <label style={{ color: "#f6e05e", fontWeight: 600, marginRight: 8 }}>
          Original Key:
        </label>
        <input
          type="text"
          value={originalKey}
          onChange={e => setOriginalKey(e.target.value)}
          style={{ fontSize: 15, borderRadius: 4, padding: '4px 10px', width: 120 }}
          placeholder="e.g. G, Bb minor"
        />
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <a href={downloadUrl} download={downloadType === "docx" ? `${title || 'chord-sheet'}.docx` : `${title || 'chord-sheet'}.pdf`} style={{ color: '#3182ce', fontWeight: 700 }}>
            Click to Save {downloadType === "docx" ? ".docx" : "PDF"}
          </a>
        )}
        {chordVaultHref && (
          <a
            href={chordVaultHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: '#2d3748', color: '#90cdf4', fontWeight: 700, border: '1px solid #4a5568', borderRadius: 4, padding: '8px 18px', textDecoration: 'none', fontSize: 14 }}
          >
            {chordVaultLabel}
          </a>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <label style={{ color: '#f6e05e', fontWeight: 600, marginRight: 12 }}>Preview:</label>
        <pre ref={previewRef} style={{ background: '#1a202c', color: '#fff', fontFamily: 'monospace', fontSize: 15, padding: 12, borderRadius: 6, marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
{title}
Key: {originalKey || keyLabel}
{chordText}
        </pre>
      </div>
    </div>
  );
}
