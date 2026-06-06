// Animated light that travels around the border of its (position:relative) parent.
// Pure CSS via a rotating conic-gradient masked to a thin ring. See App.css .border-beam.
export default function BorderBeam({ duration = 4, className = "" }) {
  return (
    <span
      className={`border-beam ${className}`}
      aria-hidden="true"
      style={{ animationDuration: `${duration}s` }}
    />
  );
}
