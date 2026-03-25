import React from 'react';

const Spinner = () => (
  <span className="spinner" aria-label="Loading">
    <svg width="22" height="22" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="22" cy="22" r="18" stroke="#66d9a3" strokeWidth="4" opacity="0.18" />
      <path d="M40 22a18 18 0 0 1-18 18" stroke="#66d9a3" strokeWidth="4" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  </span>
);

const ProgressBar = ({ progress, label }) => (
  <div className="progress-wrap">
    <div className="progress-label">
      {label}
      {progress < 100 && <Spinner />}
    </div>
    <div className="progress-track">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
    </div>
  </div>
);

export default ProgressBar;
