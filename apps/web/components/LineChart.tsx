type Point = {
  label: string;
  value: number;
};

export default function LineChart({
  points,
  strokeClass = "stroke-indigo-500",
  fillClass = "fill-indigo-500/10",
}: {
  points: Point[];
  strokeClass?: string;
  fillClass?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-28">
        <p className="text-stone-400 text-sm">Not enough history yet</p>
      </div>
    );
  }

  const width = 300;
  const height = 100;
  const padding = 4;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const stepX = (width - padding * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((p.value - min) / range) * (height - padding * 2),
  }));

  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPoints = `${padding},${height - padding} ${linePoints} ${width - padding},${height - padding}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-28"
      >
        <polygon points={areaPoints} className={fillClass} stroke="none" />
        <polyline
          points={linePoints}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={strokeClass}
        />
      </svg>
      <div className="flex items-center justify-between text-xs text-stone-400 mt-1">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
