type Bar = {
  label: string;
  value: number;
};

export default function BarChart({ bars }: { bars: Bar[] }) {
  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-28">
        <p className="text-stone-400 text-sm">Not enough history yet</p>
      </div>
    );
  }

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.value)), 1);

  return (
    <div>
      <div className="flex items-stretch h-28 gap-1">
        {bars.map((b, i) => {
          const heightPct = (Math.abs(b.value) / maxAbs) * 100;
          const isPositive = b.value >= 0;
          return (
            <div
              key={`${b.label}-${i}`}
              className="flex-1 flex flex-col"
              title={`${b.label}: ${b.value >= 0 ? "+" : ""}${b.value.toLocaleString("en-US")} sats`}
            >
              <div className="flex-1 flex items-end">
                {isPositive && (
                  <div
                    className="w-full bg-emerald-400 rounded-t-sm"
                    style={{ height: `${heightPct}%` }}
                  />
                )}
              </div>
              <div className="h-px bg-stone-200" />
              <div className="flex-1 flex items-start">
                {!isPositive && (
                  <div
                    className="w-full bg-red-400 rounded-b-sm"
                    style={{ height: `${heightPct}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-stone-400 mt-1">
        <span>{bars[0].label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}
