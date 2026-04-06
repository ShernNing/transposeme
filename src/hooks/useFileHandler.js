import { useState, useCallback } from 'react';

const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',       // mp3
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'video/mp4',
  'video/quicktime',  // mov
  'video/webm',
  'video/x-matroska', // mkv
  'video/avi',
  'video/x-msvideo',
]);

export default function useFileHandler() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = useCallback((inputFile) => {
    setError(null);
    if (!inputFile) return;
    if (inputFile.size > 5000 * 1024 * 1024) {
      setError('File is too large (max 5GB). Please choose a smaller file.');
      return;
    }
    if (inputFile.type && !ALLOWED_MIME_TYPES.has(inputFile.type)) {
      setError(`Unsupported file type "${inputFile.type}". Please upload an audio or video file (MP3, WAV, MP4, etc).`);
      return;
    }
    setFile(inputFile);
  }, []);

  return { file, setFile: handleFile, error };
}
