export default function Gauge({
  value,
  max,
  target,
  label,
  valueLabel,
  colorClass = "stroke-emerald-500",
}: {
  value: number;
  max: number;
  target?: number;
  label: string;
  valueLabel: string;
  colorClass?: string;
}) {
  const cx = 50;
  const cy = 54;
  const r = 42;
  const strokeWidth = 8;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const pointAt = (fraction: number) => {
    const theta = Math.PI * (1 + clamp(fraction));
    return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
  };

  const start = pointAt(0);
  const end = pointAt(1);
  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  const pct = max > 0 ? clamp(value / max) * 100 : 0;

  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (target !== undefined && max > 0) {
    const theta = Math.PI * (1 + clamp(target / max));
    tick = {
      x1: cx + (r - 7) * Math.cos(theta),
      y1: cy + (r - 7) * Math.sin(theta),
      x2: cx + (r + 7) * Math.cos(theta),
      y2: cy + (r + 7) * Math.sin(theta),
    };
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[180px]">
        <svg viewBox="0 0 100 64" className="w-full">
          <path
            d={arcPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="stroke-stone-100"
            pathLength={100}
          />
          <path
            d={arcPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={colorClass}
            pathLength={100}
            strokeDasharray={`${pct} 100`}
          />
          {tick && (
            <line
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              strokeWidth={2}
              className="stroke-stone-400"
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          <p className="text-lg font-semibold text-stone-800">{valueLabel}</p>
        </div>
      </div>
      <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mt-1 text-center">
        {label}
      </p>
    </div>
  );
}
