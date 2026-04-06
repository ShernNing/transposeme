import React, { useState, useRef } from 'react';

const ACCEPTED_TYPES = 'audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/x-m4a,video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi,video/x-msvideo';

const FileUpload = ({ onFileSelect, disabled }) => {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  const handleFile = (file) => {
    if (file) onFileSelect(file);
  };

  const handleChange = (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e) => { e.preventDefault(); if (!disabled) setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  return (
    <div
      className="file-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
      aria-label="Upload audio or video file"
      aria-disabled={disabled}
      style={{
        border: `2px dashed ${dragOver ? '#9ae6b4' : disabled ? '#4a5568' : '#63b3ed'}`,
        borderRadius: 10,
        padding: '24px 16px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragOver ? '#1a2e1a' : 'transparent',
        transition: 'border-color 0.15s, background 0.15s',
        margin: '12px 0',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6 }}>{dragOver ? '📂' : '🎵'}</div>
      <div style={{ color: dragOver ? '#9ae6b4' : '#a0aec0', fontWeight: 600, fontSize: 15 }}>
        {dragOver ? 'Drop to load' : 'Drag & drop or click to upload'}
      </div>
      <div style={{ color: '#718096', fontSize: 12, marginTop: 4 }}>
        MP3, WAV, FLAC, AAC, M4A, MP4, MOV, WebM — up to 5 GB
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleChange}
        disabled={disabled}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
};

export default FileUpload;
