export const YT_STEPS = [
  "Downloading audio",
  "Extracting track",
  "Detecting key",
  "Finalizing",
];

// Map the free-text processingStep from the YouTube hook to a step index.
export function stepIndexFromLabel(step) {
  if (!step) return 0;
  const s = step.toLowerCase();
  if (s.includes("finaliz")) return 3;
  if (s.includes("3/3") || s.includes("detect")) return 2;
  if (s.includes("2/3") || s.includes("extract")) return 1;
  if (s.includes("1/3") || s.includes("download") || s.includes("appl")) return 0;
  return 0;
}
