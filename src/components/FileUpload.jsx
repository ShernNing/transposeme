import React from 'react';

const FileUpload = ({ onFileSelect, disabled }) => {
  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="file-upload"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <p>Drag & drop MP3/MP4 here, or</p>
      <input
        type="file"
        accept="audio/mp3,video/mp4"
        onChange={handleChange}
        disabled={disabled}
        className="file-upload-input"
      />
    </div>
  );
};

export default FileUpload;
