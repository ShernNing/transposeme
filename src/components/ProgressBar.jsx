import React from 'react';

const ProgressBar = ({ progress, label }) => (
  <div className="progress-wrap">
    <div className="progress-label">{label}</div>
    <div className="progress-track">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
    </div>
  </div>
);

export default ProgressBar;
