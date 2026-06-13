type Block = {
  label: string;
  value: number;
  colorClass: string;
};

function Tile({ block, total }: { block: Block; total: number }) {
  const pct = total > 0 ? Math.round((block.value / total) * 100) : 0;
  return (
    <div
      className={`${block.colorClass} flex-1 flex flex-col items-start justify-end p-2 rounded-md min-h-[2.5rem] min-w-[2.5rem]`}
      style={{ flexGrow: block.value, flexBasis: 0 }}
    >
      <p className="text-white text-xs font-semibold truncate w-full">{block.label}</p>
      <p className="text-white/80 text-xs">{pct}%</p>
    </div>
  );
}

function Layout({
  blocks,
  total,
  horizontal,
}: {
  blocks: Block[];
  total: number;
  horizontal: boolean;
}) {
  if (blocks.length === 1) {
    return <Tile block={blocks[0]} total={total} />;
  }

  const [first, ...rest] = blocks;
  const restSum = rest.reduce((sum, b) => sum + b.value, 0);

  return (
    <div className={`flex ${horizontal ? "flex-row" : "flex-col"} gap-1 w-full h-full`}>
      <div
        className={`${first.colorClass} flex flex-col items-start justify-end p-2 rounded-md min-h-[2.5rem] min-w-[2.5rem]`}
        style={{ flexGrow: first.value, flexBasis: 0 }}
      >
        <p className="text-white text-xs font-semibold truncate w-full">{first.label}</p>
        <p className="text-white/80 text-xs">
          {total > 0 ? Math.round((first.value / total) * 100) : 0}%
        </p>
      </div>
      <div
        className={`flex ${horizontal ? "flex-col" : "flex-row"} gap-1`}
        style={{ flexGrow: restSum, flexBasis: 0 }}
      >
        <Layout blocks={rest} total={total} horizontal={!horizontal} />
      </div>
    </div>
  );
}

export default function Treemap({ blocks }: { blocks: Block[] }) {
  const positive = blocks.filter((b) => b.value > 0);
  const total = positive.reduce((sum, b) => sum + b.value, 0);

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-stone-400 text-sm">No data yet</p>
      </div>
    );
  }

  const sorted = [...positive].sort((a, b) => b.value - a.value);

  return (
    <div className="w-full h-48">
      <Layout blocks={sorted} total={total} horizontal={true} />
    </div>
  );
}
