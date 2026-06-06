// Aceternity-style "Lamp" — a glowing light beam + bloom behind the hero title.
// Pure CSS (see App.css .lamp*). Sits behind the title via z-index.
export default function LampGlow() {
  return (
    <div className="lamp" aria-hidden="true">
      <div className="lamp-bloom" />
      <div className="lamp-line" />
    </div>
  );
}
