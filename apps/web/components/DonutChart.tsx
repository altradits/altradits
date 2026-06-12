type Segment = {
  label: string;
  value: number;
  colorClass: string;
  dotClass: string;
};

export default function DonutChart({
  segments,
  centerLabel,
}: {
  segments: Segment[];
  centerLabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-stone-400 text-sm">No activity yet</p>
      </div>
    );
  }

  let cumulative = 0;
  const circles = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const pct = (s.value / total) * 100;
      const offset = -cumulative;
      cumulative += pct;
      return (
        <circle
          key={s.label}
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          strokeWidth="3.5"
          className={s.colorClass}
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      );
    });

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            strokeWidth="3.5"
            className="stroke-stone-100"
          />
          {circles}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs font-semibold text-stone-700 text-center px-2">
              {centerLabel}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${s.dotClass}`} />
            <span className="text-stone-500">{s.label}</span>
            <span className="text-stone-700 font-medium">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
