type Cell = {
  label: string;
  value: number;
  colorClass?: string;
  display?: string;
};

type Row = {
  label: string;
  cells: Cell[];
};

export default function Heatmap({ rows }: { rows: Row[] }) {
  if (rows.length === 0 || rows[0].cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-stone-400 text-sm">No data yet</p>
      </div>
    );
  }

  const maxAbs = Math.max(
    ...rows.flatMap((r) => r.cells.map((c) => Math.abs(c.value))),
    1
  );

  function colorFor(value: number) {
    const intensity = Math.abs(value) / maxAbs;
    if (intensity < 0.02) return "bg-stone-100";
    if (value > 0) {
      if (intensity > 0.66) return "bg-emerald-400";
      if (intensity > 0.33) return "bg-emerald-300";
      return "bg-emerald-100";
    }
    if (intensity > 0.66) return "bg-red-400";
    if (intensity > 0.33) return "bg-red-300";
    return "bg-red-100";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ borderSpacing: "3px", borderCollapse: "separate" }}>
        <thead>
          <tr>
            <th className="text-left text-stone-400 font-medium pr-2"></th>
            {rows[0].cells.map((c) => (
              <th key={c.label} className="text-stone-400 font-medium px-1 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="text-stone-500 font-medium pr-2 whitespace-nowrap">{r.label}</td>
              {r.cells.map((c, i) => (
                <td
                  key={`${r.label}-${i}`}
                  className={`${c.colorClass ?? colorFor(c.value)} rounded text-center py-1.5 px-1 text-stone-700`}
                  title={c.display ?? `${c.value >= 0 ? "+" : ""}${Math.round(c.value)} sats`}
                >
                  {c.display ?? `${c.value >= 0 ? "+" : ""}${Math.round(c.value)}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
