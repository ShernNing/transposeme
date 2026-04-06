import React from 'react';

const TransposeControls = ({ value, min, max, onChange, onReset, disabled, tempoMode, onTempoModeChange }) => (
  <div style={{ margin: '16px 0', textAlign: 'center' }}>
    {/* Mode toggle */}
    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', gap: 8 }}>
      <button
        onClick={() => onTempoModeChange && onTempoModeChange(false)}
        disabled={disabled}
        style={{
          padding: '4px 14px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
          background: !tempoMode ? '#22543d' : '#2d3748',
          color: !tempoMode ? '#9ae6b4' : '#a0aec0',
        }}
        title="Shift pitch, preserve tempo (default)"
      >
        🎵 Pitch shift
      </button>
      <button
        onClick={() => onTempoModeChange && onTempoModeChange(true)}
        disabled={disabled}
        style={{
          padding: '4px 14px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
          background: tempoMode ? '#2b4360' : '#2d3748',
          color: tempoMode ? '#90cdf4' : '#a0aec0',
        }}
        title="Slow down or speed up playback, preserve pitch"
      >
        ⏱ Tempo stretch
      </button>
    </div>

    <label style={{ color: '#fff', marginRight: 12 }}>
      {tempoMode ? 'Tempo change (semitone steps):' : 'Transpose (semitones):'}
      <span style={{ color: '#718096', fontSize: 11, marginLeft: 6 }}>← → keys</span>
    </label>
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
    <span style={{ marginLeft: 12, color: '#fff' }}>
      {tempoMode
        ? value === 0 ? '1× (original)' : `${Math.pow(2, value / 12).toFixed(2)}×`
        : value}
    </span>
  </div>
);

export default TransposeControls;
