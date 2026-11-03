// Procedural contour map with hazard hotspots and a radar sweep.
// Pure SVG (no canvas / WebGL) so it renders on the server and costs nothing.

function contour(cx: number, cy: number, r: number, seed: number, wobble: number) {
  const pts: [number, number][] = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k =
      1 +
      wobble * (0.55 * Math.sin(3 * a + seed) + 0.3 * Math.sin(5 * a + seed * 1.7) + 0.15 * Math.sin(9 * a + seed * 2.3));
    pts.push([cx + Math.cos(a) * r * k * 1.25, cy + Math.sin(a) * r * k * 0.82]);
  }
  // Catmull-Rom → cubic Bézier for smooth closed curves.
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

const PEAKS = [
  { x: 330, y: 250, n: 14, seed: 0.4, hot: true },
  { x: 760, y: 190, n: 11, seed: 2.1, hot: false },
  { x: 610, y: 420, n: 12, seed: 4.2, hot: true },
  { x: 1020, y: 380, n: 9, seed: 1.3, hot: false },
];

export function TerrainHero() {
  return (
    <svg viewBox="0 0 1200 560" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="hot" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff2e63" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#f0834f" stopOpacity="0.22" />
          <stop offset="1" stopColor="#f0834f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4c9bff" stopOpacity="0" />
          <stop offset="1" stopColor="#4c9bff" stopOpacity="0.35" />
        </linearGradient>
        <mask id="fade">
          <radialGradient id="fm" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0.4" stopColor="white" />
            <stop offset="1" stopColor="black" />
          </radialGradient>
          <rect width="1200" height="560" fill="url(#fm)" />
        </mask>
      </defs>

      <g mask="url(#fade)">
        {PEAKS.map((p) =>
          Array.from({ length: p.n }, (_, i) => (
            <path
              key={`${p.x}-${i}`}
              d={contour(p.x, p.y, 14 + i * 17, p.seed + i * 0.13, 0.08 + i * 0.012)}
              fill="none"
              stroke={i % 5 === 0 ? "rgb(255 255 255 / 0.16)" : "rgb(255 255 255 / 0.07)"}
              strokeWidth={i % 5 === 0 ? 1 : 0.7}
            />
          )),
        )}
        {PEAKS.filter((p) => p.hot).map((p, i) => (
          <g key={i}>
            <ellipse cx={p.x + 30} cy={p.y + 10} rx="120" ry="80" fill="url(#hot)">
              <animate attributeName="opacity" values="0.65;1;0.65" dur={`${3.2 + i}s`} repeatCount="indefinite" />
            </ellipse>
            <circle cx={p.x + 30} cy={p.y + 10} r="3.5" fill="#ff2e63" />
            <circle cx={p.x + 30} cy={p.y + 10} r="3.5" fill="none" stroke="#ff2e63">
              <animate attributeName="r" values="4;22" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
          </g>
        ))}
        {/* radar sweep */}
        <g transform="translate(600 300)">
          <path d="M0,0 L520,0 A520,520 0 0,0 450,-260 Z" fill="url(#sweep)" opacity="0.6">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite" />
          </path>
          {[140, 280, 420].map((r) => (
            <circle key={r} r={r} fill="none" stroke="rgb(76 155 255 / 0.1)" strokeDasharray="2 6" />
          ))}
        </g>
      </g>
    </svg>
  );
}
