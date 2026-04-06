import React, { useState } from 'react';

const YOUTUBE_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
  'm.youtube.com',
];

// Standard YouTube video ID: 11 chars of [A-Za-z0-9_-]
const VIDEO_ID_RE = /[A-Za-z0-9_-]{11}/;

function extractVideoId(parsed) {
  // youtu.be/<id>
  if (parsed.hostname === 'youtu.be') {
    return parsed.pathname.slice(1).split('/')[0] || null;
  }
  // ?v=<id> or /shorts/<id> or /live/<id> or /embed/<id>
  const vParam = parsed.searchParams.get('v');
  if (vParam) return vParam;
  const parts = parsed.pathname.split('/');
  const idx = parts.findIndex((p) => ['shorts', 'live', 'embed'].includes(p));
  if (idx !== -1) return parts[idx + 1] || null;
  return null;
}

function isValidYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    if (!YOUTUBE_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      return false;
    }
    const id = extractVideoId(parsed);
    return id != null && VIDEO_ID_RE.test(id);
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
