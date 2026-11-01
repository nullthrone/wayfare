/** Decorative hero illustration: a postcard with photo, stamp and QR code. Pure SVG, no external assets. */
export function PostcardArt({ className }: { className?: string }) {
  // Deterministic pseudo-QR pattern (purely decorative).
  const cells: [number, number][] = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (((x * 7 + y * 13 + x * y) % 5) < 2) cells.push([x, y]);
  return (
    <svg viewBox="0 0 480 340" className={className} role="img" aria-hidden fill="none">
      <defs>
        <linearGradient id="pc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d9b8" />
          <stop offset="1" stopColor="#f2efe3" />
        </linearGradient>
        <linearGradient id="pc-hill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4c8d84" />
          <stop offset="1" stopColor="#2b6a63" />
        </linearGradient>
        <filter id="pc-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#24201b" floodOpacity="0.18" />
        </filter>
      </defs>
      <g transform="rotate(-4 240 170)" filter="url(#pc-shadow)">
        <rect x="30" y="30" width="420" height="280" rx="14" fill="#fffdf8" stroke="#e6dfd4" />
        <rect x="46" y="46" width="200" height="248" rx="8" fill="url(#pc-sky)" />
        <circle cx="190" cy="106" r="22" fill="#f4b266" />
        <path d="M46 238c40-46 84-58 128-34 30 16 52 14 72-6v96H54a8 8 0 0 1-8-8z" fill="url(#pc-hill)" />
        <path d="M46 262c50-26 104-24 200 6v26a8 8 0 0 1-8 8H54a8 8 0 0 1-8-8z" fill="#22554f" opacity="0.85" />
        <line x1="266" y1="60" x2="266" y2="280" stroke="#e6dfd4" strokeDasharray="3 5" />
        <rect x="376" y="50" width="56" height="68" rx="3" fill="#e2efec" stroke="#2b6a63" strokeDasharray="3 3" />
        <circle cx="404" cy="78" r="13" fill="#2b6a63" />
        <path d="M388 106c4-10 12-14 16-14s12 4 16 14z" fill="#2b6a63" />
        <path d="M286 148h118M286 172h96M286 196h108" stroke="#cdc3b3" strokeWidth="3" strokeLinecap="round" />
        <path d="M286 100c16-16 28 12 44-4s20-12 30-4" stroke="#2b6a63" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(372 208)">
          <rect width="64" height="64" rx="6" fill="#fff" stroke="#24201b" strokeWidth="2" />
          {cells.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={5 + x * 6} y={5 + y * 6} width="5" height="5" fill="#24201b" />
          ))}
          <rect x="5" y="5" width="17" height="17" rx="2" fill="#fff" stroke="#24201b" strokeWidth="3" />
          <rect x="42" y="5" width="17" height="17" rx="2" fill="#fff" stroke="#24201b" strokeWidth="3" />
          <rect x="5" y="42" width="17" height="17" rx="2" fill="#fff" stroke="#24201b" strokeWidth="3" />
        </g>
      </g>
    </svg>
  );
}
