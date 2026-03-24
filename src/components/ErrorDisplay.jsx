import React from 'react';

const ErrorDisplay = ({ error }) => (
  error ? <div className="error-banner">{error}</div> : null
);

export default ErrorDisplay;
