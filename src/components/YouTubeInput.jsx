import React, { useState } from 'react';

const YOUTUBE_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
  'm.youtube.com',
];

function isValidYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    return YOUTUBE_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

const YouTubeInput = ({ onSubmit, disabled }) => {
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);

  const valid = !url || isValidYouTubeUrl(url);
  const canSubmit = url && valid && !disabled;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) {
      onSubmit(url);
      setUrl('');
      setTouched(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="youtube-form">
      <input
        type="url"
        placeholder="Paste YouTube link here"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setTouched(true); }}
        onBlur={() => setTouched(true)}
        disabled={disabled}
        className="youtube-input"
        aria-label="YouTube URL"
        aria-invalid={touched && url && !valid}
        style={touched && url && !valid ? { borderColor: '#f56565' } : {}}
      />
      {touched && url && !valid && (
        <div style={{ color: '#f56565', fontSize: 12, marginTop: 3 }}>
          Please enter a valid YouTube URL (youtube.com, youtu.be, youtube Shorts or Music)
        </div>
      )}
      <button type="submit" disabled={!canSubmit} className="youtube-submit-btn">
        Load
      </button>
    </form>
  );
};

export default YouTubeInput;
