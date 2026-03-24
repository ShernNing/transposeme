import React, { useState } from 'react';

const YouTubeInput = ({ onSubmit, disabled }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url) onSubmit(url);
  };

  return (
    <form onSubmit={handleSubmit} className="youtube-form">
      <input
        type="url"
        placeholder="Paste YouTube link here"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled}
        className="youtube-input"
      />
      <button type="submit" disabled={disabled || !url} className="youtube-submit-btn">
        Load
      </button>
    </form>
  );
};

export default YouTubeInput;
