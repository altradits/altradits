// Sats Safari: the 21 million cap and the halving. New coins start at 50 BTC
// a block and halve every 210,000 blocks, about every 4 years (bitcoin.org
// vocabulary: "halving"). Counted in whole sats, so repeated halving rounds
// down and the total stops just under 21 million.
import { SATS_PER_BTC } from "./sats.js";

export const INITIAL_SUBSIDY_SATS = 50 * SATS_PER_BTC;
export const HALVING_BLOCKS = 210_000;

// New sats paid to the miner of this block height.
export function subsidyAt(height) {
  if (!Number.isInteger(height) || height < 0) throw new Error("height counts blocks from 0");
  const era = Math.floor(height / HALVING_BLOCKS);
  if (era >= 64) return 0;
  return Math.floor(INITIAL_SUBSIDY_SATS / 2 ** era);
}

// All sats created before this block height (blocks 0..height-1).
export function totalAt(height) {
  if (!Number.isInteger(height) || height < 0) throw new Error("height counts blocks from 0");
  let total = 0, era = 0, left = height;
  while (left > 0) {
    const take = Math.min(left, HALVING_BLOCKS);
    total += take * Math.floor(INITIAL_SUBSIDY_SATS / 2 ** era);
    left -= take;
    era++;
    if (era >= 64) break;
  }
  return total;
}

// Every sat that will ever exist: just under 21 million bitcoin.
export function maxSupply() {
  return totalAt(HALVING_BLOCKS * 64);
}
