import React, { useId } from 'react';

// Same props as before. If a custom `color` is passed it is used as a solid stroke;
// otherwise the arc uses the cobalt -> cerulean gradient with a glowing end point.
export default function ProgressRing({ value, max, size = 120, stroke = 10, label, sublabel, color }) {
  const gid = useId().replace(/:/g, '');
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = circ - pct * circ;
  const cx = size / 2;
  const angle = pct * 2 * Math.PI;             // svg is rotated -90deg via CSS, so 0 rad starts at 12 o'clock
  const dotX = cx + radius * Math.cos(angle);
  const dotY = cx + radius * Math.sin(angle);
  const useGradient = !color;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`ring-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#60A5FA" />
          </linearGradient>
          <filter id={`glow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cx} r={radius} fill="none"
          stroke={useGradient ? `url(#ring-${gid})` : color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          filter={useGradient ? `url(#glow-${gid})` : undefined}
          className="transition-all duration-700 ease-out"
        />
        {useGradient && pct > 0 && pct < 1 && (
          <circle cx={dotX} cy={dotY} r={Math.max(2, stroke / 3)} fill="#fff" filter={`url(#glow-${gid})`} className="transition-all duration-700 ease-out" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-lg font-semibold font-heading leading-none tabular-nums">{label}</span>}
        {sublabel && <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-[0.08em]">{sublabel}</span>}
      </div>
    </div>
  );
}
