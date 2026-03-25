// ProcessedHistory.jsx
// Sidebar/history list for previously processed audio/video items
import React, { useState } from "react";
import { clearAllProcessedItems } from "../utils/db";


// Format duration as h:mm:ss or m:ss
function formatDuration(seconds) {
  if (!isFinite(seconds)) return '';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor((seconds / 60) % 60).toString();
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${m.padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}

export default function ProcessedHistory({ processedItems, onLoad, onDelete, onClear, onRefresh }) {
    // Search/filter state
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
  // Track which item is hovered for styling and delete button
  const [hoveredId, setHoveredId] = useState(null);
  // Track last deleted item for undo
  const [lastDeleted, setLastDeleted] = useState(null);

  // Handler: Delete a single item (with undo)
  const handleDelete = (item) => {
    setLastDeleted(item);
    if (onDelete) onDelete(item.id);
  };

  // Handler: Undo last delete
  const handleUndo = () => {
    if (lastDeleted && window.confirm("Restore deleted item?")) {
      // Re-add to DB and refresh
      import("../utils/db").then(({ saveProcessedItem }) => {
        saveProcessedItem(lastDeleted).then(() => {
          if (onRefresh) onRefresh();
          setLastDeleted(null);
        });
      });
    }
  };

  // Only show items with semitones === 0 (original key)
  let originalItems = processedItems.filter(item => item.semitones === 0);
  // Filter by type
  if (typeFilter !== "all") {
    originalItems = originalItems.filter(item =>
      (typeFilter === "youtube" && item.isYouTube) ||
      (typeFilter === "file" && !item.isYouTube)
    );
  }
  // Filter by search
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    originalItems = originalItems.filter(item =>
      (item.fileName && item.fileName.toLowerCase().includes(q)) ||
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.label && item.label.toLowerCase().includes(q)) ||
      (item.youtubeUrl && item.youtubeUrl.toLowerCase().includes(q))
    );
  }


  // Handler: Clear all processed items with confirmation
  const handleClear = async () => {
    if (!window.confirm("Are you sure you want to clear all processed history? This cannot be undone.")) return;
    await clearAllProcessedItems();
    if (onClear) onClear();
  };

  // If no original items, render nothing
  if (!originalItems || originalItems.length === 0) return null;

  return (
    // Sidebar card container
    <div
      style={{
        margin: "12px 0 18px",
        padding: 0,
        background: "#23272f",
        borderRadius: 12,
        boxShadow: "0 2px 12px #0002",
        border: "1px solid #23272f",
        minHeight: 80,
      }}
    >
      {/* Header and Clear button (only if there are items) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#a0aec0", fontSize: 14, fontWeight: 600, padding: "16px 20px 8px 20px" }}>
        <span>Processed History</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {originalItems.length > 0 && (
            <button
              style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #38405a", background: "#38405a", color: "#e2e8f0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
              onClick={handleClear}
            >
              Clear All
            </button>
          )}
          <button
            style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #38405a", background: "#38405a", color: "#e2e8f0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>
      {/* Filter/search controls */}
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
      {/* List of processed items (only originals) */}
      <div style={{ display: "flex", flexDirection: 'column', gap: 0 }}>
        {originalItems.map((item, idx) => (
          // Row for each processed item
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 20px',
              background: hoveredId === item.id ? '#31384a' : (idx % 2 === 0 ? 'transparent' : '#262b36'),
              borderBottom: idx === originalItems.length - 1 ? 'none' : '1px solid #23272f',
              minHeight: 44,
              position: 'relative',
              transition: 'background 0.15s',
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Load button for this item */}
            <button
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #38405a",
                background: hoveredId === item.id ? "#38405a" : "#23272f",
                color: hoveredId === item.id ? "#9ae6b4" : "#e2e8f0",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                minWidth: 90,
                boxShadow: hoveredId === item.id ? "0 2px 8px #0002" : undefined,
                transition: 'all 0.15s',
              }}
              onClick={() => onLoad(item)}
            >
              {item.fileName || item.title || item.label || item.youtubeUrl}
            </button>
            {/* Metadata for this item */}
            <span style={{ color: '#b5b5b5', fontSize: 12, flex: 1 }}>
              {item.metadata && (
                <>
                  {item.metadata.duration && (
                    <span>⏱ {formatDuration(item.metadata.duration)} </span>
                  )}
                  {item.metadata.sampleRate && (
                    <span>• {item.metadata.sampleRate}Hz </span>
                  )}
                  {item.metadata.channels && (
                    <span>• {item.metadata.channels}ch </span>
                  )}
                  {item.metadata.width && item.metadata.height && (
                    <span>• {item.metadata.width}x{item.metadata.height}px </span>
                  )}
                </>
              )}
            </span>
            {/* Delete button, only visible on hover */}
            {onDelete && hoveredId === item.id && (
              <button
                onClick={() => onDelete(item.id)}
                style={{
                  marginLeft: 4,
                  background: 'transparent',
                  border: 'none',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                  fontSize: 18,
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 0,
                  opacity: 0.92,
                }}
                title="Delete from history"
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
