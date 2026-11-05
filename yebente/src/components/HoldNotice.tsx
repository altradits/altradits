import React from 'react';

// The post-recovery hold, as the server reports it: what can still leave, and when it ends.
export const HoldNotice: React.FC<{ hold: { until: string; total: number; left: number } }> = ({ hold }) => {
  let ends = '';
  try {
    ends = new Date(hold.until).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { ends = 'soon'; }
  return (
    <p className="text-[11px] text-amber-300/90 px-1">
      Recovery hold: {hold.left.toLocaleString()} of {hold.total.toLocaleString()} sats can still be sent, until {ends}.
    </p>
  );
};
