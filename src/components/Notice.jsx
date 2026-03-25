import React from "react";

export default function Notice({ notice }) {
  if (!notice) return null;
  return (
    <div
      style={{
        margin: "8px 0 10px",
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 13,
        background: notice.type === "success" ? "#1f3b2b" : "#2d3748",
        border: `1px solid ${notice.type === "success" ? "#38a169" : "#4a5568"}`,
        color: notice.type === "success" ? "#9ae6b4" : "#e2e8f0",
      }}
    >
      {notice.message}
    </div>
  );
}
