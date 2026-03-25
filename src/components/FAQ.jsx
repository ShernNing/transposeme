import React, { useState } from 'react';

const features = [
  "Transpose audio and video files (MP3, MP4, YouTube) instantly in your browser.",
  "No server upload: all processing is local for privacy and speed.",
  "Automatic song key detection and re-analysis.",
  "Real-time key shifting with slider or buttons.",
  "Download or share transposed files easily.",
  "Processed history with metadata and quick re-download.",
  "Mobile-friendly and desktop-optimized UI.",
  "Progress bar and loading feedback for all actions.",
  "Robust error handling and auto-recovery for YouTube links.",
  "Supports large files (up to 5000MB)."
];

const FAQ = () => {
  const [open, setOpen] = useState(false);
  return (
    <section className="faq-card" style={{ margin: '16px auto', maxWidth: 600 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: '#2d3748',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '8px 16px',
          cursor: 'pointer',
          marginBottom: 8,
          width: '100%',
          fontWeight: 600,
          fontSize: 18,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        aria-expanded={open}
        aria-controls="faq-content"
      >
        <span>FAQ, Features & Functions</span>
        <span style={{ fontSize: 22 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div id="faq-content">
          <h3 style={{ marginTop: 0 }}>Features</h3>
          <ul>
            {features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <h3>FAQ</h3>
          <ul>
            <li><b>What file types are supported?</b> MP3, MP4, and YouTube audio.</li>
            <li><b>Is my file uploaded to a server?</b> No, all processing is done in your browser.</li>
            <li><b>Can I transpose in real time?</b> Yes, use the slider or buttons to change the key instantly.</li>
            <li><b>Is there a file size limit?</b> Yes, 5000MB per file.</li>
            <li><b>Is the app mobile-friendly?</b> Yes, the UI is optimized for mobile and desktop.</li>
            <li><b>How does YouTube key analysis work?</b> The app fetches and analyzes the audio to detect the key, with auto-retry and re-analyze options.</li>
            <li><b>What if metadata is missing?</b> The app will auto-retry fetching and update the processed history when available.</li>
            <li><b>How do I save space?</b> Collapse this FAQ section using the button above.</li>
          </ul>
        </div>
      )}
    </section>
  );
};

export default FAQ;
