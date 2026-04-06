import { useState, useEffect, useCallback } from "react";
import {
  saveProcessedItem,
  deleteProcessedItem,
  getAllProcessedItems,
  clearAllProcessedItems,
} from "../utils/db";

// Recursively strip non-serializable/circular values (keep Blob and Date)
function toSerializable(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") return obj;
  if (seen.has(obj)) return undefined;
  seen.add(obj);
  if (obj instanceof Blob || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map((v) => toSerializable(v, seen));
  if (
    obj instanceof HTMLElement ||
    obj instanceof EventTarget ||
    (obj.constructor?.name?.includes("FiberNode"))
  ) {
    return undefined;
  }
  const out = {};
  for (const k in obj) {
    if (typeof obj[k] === "function") continue;
    const ser = toSerializable(obj[k], seen);
    if (ser !== undefined) out[k] = ser;
  }
  return out;
}

export default function useProcessedHistory() {
  const [processedItems, setProcessedItems] = useState([]);

  // Load from IndexedDB on mount, fallback to localStorage (legacy)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const dbItems = await getAllProcessedItems();
        if (mounted && dbItems?.length > 0) {
          const normalized = dbItems.map((i) => ({ ...i, semitones: Number(i.semitones ?? 0) }));
          setProcessedItems(normalized);
          localStorage.setItem("transpose_processedItems", JSON.stringify(normalized));
          return;
        }
      } catch {
        // fall through to localStorage
      }
      if (!mounted) return;
      try {
        const saved = localStorage.getItem("transpose_processedItems");
        if (saved) {
          const items = JSON.parse(saved);
          setProcessedItems(items.map((i) => ({ ...i, semitones: Number(i.semitones ?? 0) })));
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const addProcessedItem = useCallback((item) => {
    const serializableItem = toSerializable({ ...item, semitones: Number(item.semitones ?? 0) });
    saveProcessedItem(serializableItem)
      .then(() => getAllProcessedItems())
      .then((dbItems) => {
        setProcessedItems(dbItems);
        localStorage.setItem("transpose_processedItems", JSON.stringify(dbItems));
      })
      .catch(() => {
        setProcessedItems((prev) => {
          const exists = prev.some((x) => x.id === serializableItem.id);
          const next = exists ? prev : [serializableItem, ...prev];
          const trimmed = next.slice(0, 10);
          localStorage.setItem("transpose_processedItems", JSON.stringify(trimmed));
          return trimmed;
        });
      });
  }, []);

  const handleDeleteProcessed = useCallback((id) => {
    setProcessedItems((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      localStorage.setItem("transpose_processedItems", JSON.stringify(filtered));
      deleteProcessedItem(id).catch(() => {});
      return filtered;
    });
  }, []);

  const handleClearProcessed = useCallback(async () => {
    await clearAllProcessedItems();
    setProcessedItems([]);
  }, []);

  const refreshProcessedItems = useCallback(async () => {
    const dbItems = await getAllProcessedItems();
    setProcessedItems(dbItems);
  }, []);

  return {
    processedItems,
    addProcessedItem,
    handleDeleteProcessed,
    handleClearProcessed,
    refreshProcessedItems,
  };
}
