import React from 'react';
import Magnetic from './fx/Magnetic';

const DownloadShare = ({ onDownload, onShare, disabled, formats, selectedFormat, onFormatChange }) => (
  <div className="download-share">
    <label className="download-share-label">Output format:</label>
    <select className="download-share-select" value={selectedFormat} onChange={e => onFormatChange(e.target.value)} disabled={disabled}>
      {formats.map(fmt => <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>)}
    </select>
    <Magnetic>
      <button onClick={onDownload} disabled={disabled} className="shimmer-btn">Download</button>
    </Magnetic>
    <button onClick={onShare} disabled={disabled}>Share</button>
  </div>
);

export default DownloadShare;
