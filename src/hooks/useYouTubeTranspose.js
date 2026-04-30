import { useState, useRef, useCallback } from "react";
import { extractMetadata } from "../utils/audioUtils";
import { CONFIG } from "../utils/config";

// Human-readable errors from backend payloads
function prettyApiError(fallback, payloadText = "") {
  const text = (payloadText || "").toLowerCase();
  if (text.includes("proxy") || text.includes("403"))
    return "Network/proxy blocked YouTube download. Please disable any proxy/VPN and try again.";
  if (text.includes("private video") || text.includes("video unavailable"))
    return "This YouTube video is unavailable for download. It may be private, region-locked, or removed.";
  if (text.includes("rate limit") || text.includes("too many requests"))
    return "YouTube has temporarily rate-limited your requests. Please wait a minute and try again.";
  if (text.includes("networkerror") || text.includes("failed to fetch"))
    return "Network error: Unable to reach the server. Please check your internet connection.";
  if (text.includes("timeout"))
    return "The request timed out. Please try again in a moment.";
  if (text.includes("unsupported format") || text.includes("not supported"))
    return "The selected video format is not supported. Please use a valid YouTube link.";
  return fallback;
}

function evictCache(cacheMap, maxSize) {
  if (cacheMap.size >= maxSize) {
    cacheMap.delete(cacheMap.keys().next().value);
  }
}

async function retry(fn, attempts = 3, delay = 500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

async function fetchYouTubeTitle(url) {
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.title || null;
  } catch {
    return null;
  }
}

/**
 * Encapsulates all YouTube-specific state and handlers.
 *
 * Callbacks received from App.jsx (shared state updates):
 *   setTransposedFromBlob, setOriginalSrc, setAppliedSemitones,
 *   setPendingSemitones, setQueuedDelta, setPlaying, setShowOriginalYouTube,
 *   setFile, setSemitones, setAppError, addProcessedItem, API_BASE_URL
 */
export default function useYouTubeTranspose({
  setTransposedFromBlob,
  setOriginalSrc,
  setAppliedSemitones,
  setPendingSemitones,
  setQueuedDelta,
  setPlaying,
  setShowOriginalYouTube,
  setFile,
  setSemitones,
  setAppError,
  addProcessedItem,
  API_BASE_URL,
}) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeKey, setYoutubeKey] = useState("");
  const [isProcessingYouTube, setIsProcessingYouTube] = useState(false);
  const [isAnalyzingKey, setIsAnalyzingKey] = useState(false);

  const keyCacheRef = useRef(new Map());
  const youtubeCacheRef = useRef(new Map());
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchYouTubeTransposed = useCallback(
    async (url, semitones) => {
      const cacheKey = `${url}::${semitones}`;
      if (youtubeCacheRef.current.has(cacheKey)) {
        return youtubeCacheRef.current.get(cacheKey);
      }
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      console.log("[API] POST", `${API_BASE_URL}/api/youtube-transpose`, {
        url,
        semitones,
      });
      let response;
      try {
        response = await fetch(`${API_BASE_URL}/api/youtube-transpose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, semitones }),
          signal: controller.signal,
        });
        console.log("[API] Response", response.status, response.statusText);
      } catch (err) {
        console.error("[API] Network error (youtube-transpose):", err);
        throw err;
      }
      if (!response.ok) {
        const errText = await response.text();
        console.error("[API] Error response (youtube-transpose):", errText);
        throw new Error(
          prettyApiError("Failed to process YouTube link.", errText),
        );
      }
      const blob = await response.blob();
      evictCache(youtubeCacheRef.current, CONFIG.YOUTUBE_BLOB_CACHE_MAX);
      youtubeCacheRef.current.set(cacheKey, blob);
      return blob;
    },
    [API_BASE_URL],
  );

  const handleAnalyzeKey = useCallback(
    async (urlOverride) => {
      const url = urlOverride || youtubeUrl;
      if (!url) {
        setAppError("Load a YouTube URL first.");
        return;
      }
      setAppError("");
      if (keyCacheRef.current.has(url)) {
        setYoutubeKey(keyCacheRef.current.get(url));
        return;
      }
      setIsAnalyzingKey(true);
      try {
        console.log("[API] POST", `${API_BASE_URL}/api/youtube-key`, { url });
        let response;
        try {
          response = await fetch(`${API_BASE_URL}/api/youtube-key`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          console.log("[API] Response", response.status, response.statusText);
        } catch (err) {
          console.error("[API] Network error (youtube-key):", err);
          throw err;
        }
        if (!response.ok) {
          const errText = await response.text();
          console.error("[API] Error response (youtube-key):", errText);
          throw new Error(
            prettyApiError("Failed to analyze song key.", errText),
          );
        }
        const data = await response.json();
        const detected = data?.key || "Unknown";
        evictCache(keyCacheRef.current, CONFIG.KEY_CACHE_MAX);
        keyCacheRef.current.set(url, detected);
        setYoutubeKey(detected);
      } catch (e) {
        setAppError("Key analysis failed: " + (e?.message || "Unknown error"));
      } finally {
        setIsAnalyzingKey(false);
      }
    },
    [youtubeUrl, API_BASE_URL, setAppError],
  );

  const handleYouTube = useCallback(
    async (url) => {
      setAppError("");
      setYoutubeUrl(url);
      setFile(null);
      setShowOriginalYouTube(true);
      setYoutubeKey("");
      setSemitones(0);
      setPendingSemitones(null);
      setAppliedSemitones(0);
      setTransposedFromBlob(null);
      setOriginalSrc(null);
      setIsProcessingYouTube(true);
      try {
        const blob = await fetchYouTubeTransposed(url, 0);
        setTransposedFromBlob(blob);
        setOriginalSrc(URL.createObjectURL(blob));
        setAppliedSemitones(0);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setShowOriginalYouTube(false);
        setPlaying(true);

        const [meta, title] = await Promise.all([
          extractMetadata(blob, "audio"),
          fetchYouTubeTitle(url),
        ]);
        addProcessedItem({
          id: `${url}::0`,
          type: "youtube",
          label: title || url,
          title: title || url,
          blob,
          semitones: 0,
          isYouTube: true,
          youtubeUrl: url,
          metadata: meta,
        });

        // Auto-detect key
        if (keyCacheRef.current.has(url)) {
          setYoutubeKey(keyCacheRef.current.get(url));
        } else {
          setIsAnalyzingKey(true);
          try {
            console.log("[API] POST", `${API_BASE_URL}/api/youtube-key`, {
              url,
            });
            const keyResp = await fetch(`${API_BASE_URL}/api/youtube-key`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            console.log("[API] Response", keyResp.status, keyResp.statusText);
            if (keyResp.ok) {
              const keyData = await keyResp.json();
              const detected = keyData?.key || "Unknown";
              keyCacheRef.current.set(url, detected);
              setYoutubeKey(detected);
            } else {
              const errText = await keyResp.text();
              console.error("[API] Error response (youtube-key):", errText);
            }
          } catch (err) {
            console.error("[API] Network error (youtube-key):", err);
          } finally {
            setIsAnalyzingKey(false);
          }
        }
      } catch (e) {
        if (e.name === "AbortError") return;
        setTransposedFromBlob(null);
        setAppError(
          "YouTube processing failed: " + (e?.message || "Unknown error"),
        );
        console.error("[YouTube] Processing failed:", e);
      } finally {
        setIsProcessingYouTube(false);
      }
    },
    [
      fetchYouTubeTransposed,
      addProcessedItem,
      setAppError,
      setFile,
      setShowOriginalYouTube,
      setSemitones,
      setPendingSemitones,
      setAppliedSemitones,
      setTransposedFromBlob,
      setOriginalSrc,
      setQueuedDelta,
      setPlaying,
      API_BASE_URL,
    ],
  );

  // YouTube branch of runTranspose — call this when only URL is active
  const runYouTubeTranspose = useCallback(
    async (newSemitones, { currentTime = 0, setSeekTo } = {}) => {
      setIsProcessingYouTube(true);
      try {
        const blob = await fetchYouTubeTransposed(youtubeUrl, newSemitones);
        setTransposedFromBlob(blob);
        setAppliedSemitones(newSemitones);
        setPendingSemitones(null);
        setQueuedDelta(0);
        setShowOriginalYouTube(false);
        if (setSeekTo) setSeekTo(currentTime);
        setPlaying(true);

        let title = youtubeUrl;
        let meta = null;
        try {
          title =
            (await retry(() => fetchYouTubeTitle(youtubeUrl), 3, 500)) ||
            youtubeUrl;
        } catch {}
        try {
          meta = await retry(() => extractMetadata(blob, "audio"), 3, 500);
        } catch {}

        addProcessedItem({
          id: `${youtubeUrl}::${newSemitones}`,
          type: "youtube",
          label: title,
          title,
          blob,
          semitones: newSemitones,
          isYouTube: true,
          youtubeUrl,
          metadata: meta,
        });
      } catch (e) {
        if (e.name === "AbortError") return;
        setTransposedFromBlob(null);
        setAppError(
          "YouTube processing failed: " + (e?.message || "Unknown error"),
        );
        console.error("[YouTube] Transpose failed:", e);
      } finally {
        setIsProcessingYouTube(false);
      }
    },
    [
      youtubeUrl,
      fetchYouTubeTransposed,
      addProcessedItem,
      setTransposedFromBlob,
      setAppliedSemitones,
      setPendingSemitones,
      setQueuedDelta,
      setShowOriginalYouTube,
      setPlaying,
      setAppError,
    ],
  );

  const cleanup = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return {
    youtubeUrl,
    setYoutubeUrl,
    youtubeKey,
    setYoutubeKey,
    isProcessingYouTube,
    isAnalyzingKey,
    keyCacheRef,
    debounceRef,
    handleYouTube,
    handleAnalyzeKey,
    fetchYouTubeTransposed,
    runYouTubeTranspose,
    cleanup,
  };
}
