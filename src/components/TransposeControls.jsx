import React from 'react';

const TransposeControls = ({ value, min, max, onChange, onReset, disabled }) => (
  <div style={{ margin: '16px 0', textAlign: 'center' }}>
    <label style={{ color: '#fff', marginRight: 12 }}>Transpose (semitones):</label>
    <button onClick={() => onChange(value - 1)} disabled={disabled || value <= min}>-</button>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      disabled={disabled}
      style={{ margin: '0 12px', verticalAlign: 'middle' }}
    />
    <button onClick={() => onChange(value + 1)} disabled={disabled || value >= max}>+</button>
    <button onClick={onReset} disabled={disabled || value === 0} style={{ marginLeft: 8 }}>
      Reset
    </button>
    <span style={{ marginLeft: 12, color: '#fff' }}>{value}</span>
  </div>
);

export default TransposeControls;
