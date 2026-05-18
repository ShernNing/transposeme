import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const features = [
  "Transpose YouTube videos and local audio/video files instantly.",
  "No server upload — all file processing is local for privacy and speed.",
  "Automatic song key detection from YouTube audio.",
  "Real-time key shifting with slider, buttons, or arrow keys.",
  "Download transposed files in MP3 or MP4 format.",
  "Processed history with metadata and quick re-load.",
  "Chord sheet for the current key with Roman numeral notation.",
  "Export/import history as JSON.",
  "Progress feedback for all long-running actions.",
  "Supports large files up to 5 GB.",
];

const faqItems = [
  { q: "What file types are supported?", a: "MP3, WAV, FLAC, AAC, M4A, MP4, MOV, WebM, and YouTube links." },
  { q: "Is my file uploaded to a server?", a: "Local file processing stays in your browser. YouTube downloads use the local backend server — no data leaves your machine." },
  { q: "Can I transpose in real time?", a: "Yes — drag the slider or press ← → arrow keys to step ±1 semitone instantly." },
  { q: "Is there a file size limit?", a: "5 GB per file." },
  { q: "How does key detection work?", a: "The backend downloads the YouTube audio and runs Essentia's key-detection algorithm on it." },
  { q: "What if key analysis fails?", a: "Use the Re-analyze button. If Essentia is unavailable (arm64 mismatch), the endpoint returns 503 and key analysis is disabled." },
];

export default function FAQ() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const handleClick = (e) => { if (modalRef.current && !modalRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('keydown', handleKey); document.removeEventListener('mousedown', handleClick); };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="faq-fab"
        title="Help & FAQ"
        aria-label="Open help and FAQ"
      >
        ?
      </button>

      {open && createPortal(
        <div className="faq-overlay" role="dialog" aria-modal="true" aria-label="Help & FAQ">
          <div className="faq-modal" ref={modalRef}>
            <div className="faq-modal-header">
              <span>Help &amp; FAQ</span>
              <button onClick={() => setOpen(false)} className="faq-close" aria-label="Close">✕</button>
            </div>
            <div className="faq-modal-body">
              <h3 className="faq-section-title">Features</h3>
              <ul className="faq-list">
                {features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              <h3 className="faq-section-title">FAQ</h3>
              <div className="faq-items">
                {faqItems.map(({ q, a }, i) => (
                  <div key={i} className="faq-item">
                    <div className="faq-q">{q}</div>
                    <div className="faq-a">{a}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
