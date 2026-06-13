type NetworkPeer = {
  label: string;
  connected: boolean;
};

export default function NetworkGraph({
  centerLabel,
  peers,
}: {
  centerLabel: string;
  peers: NetworkPeer[];
}) {
  if (peers.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-stone-400 text-sm">No peers yet</p>
      </div>
    );
  }

  const cx = 160;
  const cy = 160;
  const ringR = 105;
  const nodeR = 8;
  const centerR = 26;

  const positions = peers.map((_, i) => {
    const theta = (2 * Math.PI * i) / peers.length - Math.PI / 2;
    return {
      x: cx + ringR * Math.cos(theta),
      y: cy + ringR * Math.sin(theta),
    };
  });

  return (
    <div className="flex items-center justify-center">
      <svg viewBox="0 0 320 320" className="w-full max-w-md">
        {peers.map((p, i) => (
          <line
            key={`line-${p.label}`}
            x1={cx}
            y1={cy}
            x2={positions[i].x}
            y2={positions[i].y}
            strokeWidth={2}
            className={p.connected ? "stroke-emerald-400" : "stroke-stone-300"}
            strokeDasharray={p.connected ? undefined : "4 4"}
          />
        ))}
        <circle cx={cx} cy={cy} r={centerR} className="fill-indigo-500" />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white font-semibold"
          fontSize="9"
        >
          {centerLabel}
        </text>
        {peers.map((p, i) => (
          <g key={`peer-${p.label}`}>
            <circle
              cx={positions[i].x}
              cy={positions[i].y}
              r={nodeR}
              className={p.connected ? "fill-emerald-400" : "fill-stone-300"}
            />
            <text
              x={positions[i].x}
              y={positions[i].y + nodeR + 12}
              textAnchor="middle"
              className="fill-stone-600"
              fontSize="9"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
