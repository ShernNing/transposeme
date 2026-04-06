// Central configuration — all magic numbers live here.
// Import this on both client and server to stay in sync.

export const CONFIG = {
  // File limits
  MAX_FILE_SIZE_BYTES: 5000 * 1024 * 1024, // 5 GB
  MAX_VIDEO_DURATION_SECONDS: 1200,          // 20 min

  // Transposition
  SEMITONE_MIN: -12,
  SEMITONE_MAX: 12,
  TRANSPOSE_DEBOUNCE_MS: 250,

  // Server timeouts (ms)
  YT_TIMEOUT_MS: 120_000,
  RUBBERBAND_TIMEOUT_MS: 120_000,
  PYTHON_TIMEOUT_MS: 60_000,

  // Caches
  YOUTUBE_BLOB_CACHE_MAX: 20,
  KEY_CACHE_MAX: 50,
  METADATA_TIMEOUT_MS: 8_000,

  // UI
  NOTICE_DURATION_MS: 2_800,
  PLAYBACK_RATES: [0.5, 0.75, 1, 1.25, 1.5, 2],

  // Rate limiting
  RATE_LIMIT_MAX: 20,
  RATE_LIMIT_WINDOW_MS: 60_000,
};
