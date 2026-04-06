// ProcessedHistory.jsx
import React, { useState, useMemo, useRef } from "react";
import { clearAllProcessedItems, saveProcessedItem } from "../utils/db";

function formatDuration(seconds) {
  if (!isFinite(seconds)) return '';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor((seconds / 60) % 60).toString();
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${m.padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}

export default function ProcessedHistory({ processedItems, onLoad, onDelete, onClear, onRefresh }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [hoveredId, setHoveredId] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const importRef = useRef();

  const handleExport = () => {
    // Export metadata only — blobs are not JSON-serializable
    const exportable = processedItems.map(({ blob, ...rest }) => rest);
    const json = JSON.stringify(exportable, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "transposeme-history.json";
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const items = JSON.parse(text);
      if (!Array.isArray(items)) throw new Error("Expected an array");
      for (const item of items) {
        if (item.id) {
          // Normalize semitones
          item.semitones = Number(item.semitones ?? 0);
          await saveProcessedItem(item);
        }
      }
      if (onRefresh) await onRefresh();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
    // Reset input so the same file can be re-imported
    e.target.value = "";
  };

  const handleDelete = (item) => {
    setLastDeleted(item);
    if (onDelete) onDelete(item.id);
  };

  const handleUndo = () => {
    if (!lastDeleted) return;
    saveProcessedItem(lastDeleted).then(() => {
      if (onRefresh) onRefresh();
      setLastDeleted(null);
    });
  };

  const filteredItems = useMemo(() => {
    let items = processedItems.filter(item => item.semitones === 0);
    if (typeFilter !== "all") {
      items = items.filter(item =>
        (typeFilter === "youtube" && item.isYouTube) ||
        (typeFilter === "file" && !item.isYouTube)
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(item =>
        (item.fileName && item.fileName.toLowerCase().includes(q)) ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.label && item.label.toLowerCase().includes(q)) ||
        (item.youtubeUrl && item.youtubeUrl.toLowerCase().includes(q))
      );
    }
    return items;
  }, [processedItems, typeFilter, search]);

  const handleClear = async () => {
    if (!window.confirm("Are you sure you want to clear all processed history? This cannot be undone.")) return;
    await clearAllProcessedItems();
    if (onClear) onClear();
  };

  if (!filteredItems || filteredItems.length === 0) return null;

  return (
    <div style={{ margin: "12px 0 18px", padding: 0, background: "#23272f", borderRadius: 12, boxShadow: "0 2px 12px #0002", border: "1px solid #23272f", minHeight: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#a0aec0", fontSize: 14, fontWeight: 600, padding: "16px 20px 8px 20px" }}>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#a0aec0", fontSize: 14, fontWeight: 600, padding: 0, display: "flex", alignItems: "center", gap: 6 }}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand history" : "Collapse history"}
        >
          <span style={{ fontSize: 10, display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
          Processed History
          <span style={{ color: "#4a5568", fontSize: 12, fontWeight: 400 }}>({filteredItems.length})</span>
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastDeleted && (
            <button
              onClick={handleUndo}
              style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #68d391", background: "transparent", color: "#68d391", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Undo Delete
            </button>
          )}
          <button
            style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #38405a", background: "#38405a", color: "#e2e8f0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            onClick={handleExport}
            title="Export history metadata to JSON"
          >
            Export
          </button>
          <button
            style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #38405a", background: "#38405a", color: "#e2e8f0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            onClick={() => importRef.current?.click()}
            title="Import history from a previously exported JSON file"
          >
            Import
          </button>
          <input ref={importRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImport} />
          <button
            style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #38405a", background: "#38405a", color: "#e2e8f0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            onClick={handleClear}
          >
            Clear All
          </button>
          <button
            style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #38405a", background: "#38405a", color: "#e2e8f0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>
      {!collapsed && <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 20px 8px 20px', marginBottom: 2 }}>
        <input
          type="text"
          placeholder="Search by title or URL..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #38405a', background: '#23272f', color: '#e2e8f0', fontSize: 14 }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #38405a', background: '#23272f', color: '#e2e8f0', fontSize: 14 }}
        >
          <option value="all">All</option>
          <option value="file">Files</option>
          <option value="youtube">YouTube</option>
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: 'column', gap: 0 }}>
        {filteredItems.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
              background: hoveredId === item.id ? '#31384a' : (idx % 2 === 0 ? 'transparent' : '#262b36'),
              borderBottom: idx === filteredItems.length - 1 ? 'none' : '1px solid #23272f',
              minHeight: 44, position: 'relative', transition: 'background 0.15s',
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid #38405a",
                background: hoveredId === item.id ? "#38405a" : "#23272f",
                color: hoveredId === item.id ? "#9ae6b4" : "#e2e8f0",
                fontSize: 14, fontWeight: 500, cursor: "pointer", minWidth: 90,
                boxShadow: hoveredId === item.id ? "0 2px 8px #0002" : undefined,
                transition: 'all 0.15s',
              }}
              onClick={() => onLoad(item)}
            >
              {item.fileName || item.title || item.label || item.youtubeUrl}
            </button>
            <span style={{ color: '#b5b5b5', fontSize: 12, flex: 1 }}>
              {item.metadata && (
                <>
                  {item.metadata.duration && <span>⏱ {formatDuration(item.metadata.duration)} </span>}
                  {item.metadata.sampleRate && <span>• {item.metadata.sampleRate}Hz </span>}
                  {item.metadata.channels && <span>• {item.metadata.channels}ch </span>}
                  {item.metadata.width && item.metadata.height && <span>• {item.metadata.width}x{item.metadata.height}px </span>}
                </>
              )}
            </span>
            {onDelete && hoveredId === item.id && (
              <button
                onClick={() => handleDelete(item)}
                style={{ marginLeft: 4, background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 18, position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', padding: 0, opacity: 0.92 }}
                title="Delete from history"
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}
