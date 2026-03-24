import React from 'react';

const DownloadShare = ({ onDownload, onShare, disabled, formats, selectedFormat, onFormatChange }) => (
  <div className="download-share">
    <label className="download-share-label">Output format:</label>
    <select className="download-share-select" value={selectedFormat} onChange={e => onFormatChange(e.target.value)} disabled={disabled}>
      {formats.map(fmt => <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>)}
    </select>
    <button onClick={onDownload} disabled={disabled}>Download</button>
    <button onClick={onShare} disabled={disabled}>Share</button>
  </div>
);

export default DownloadShare;
