// Sats Safari: proof of work as a guessing game. Guess a number (nonce) until
// the block's fingerprint starts with zeros (whitepaper section 4). When
// blocks come too fast the game asks for more zeros, too slow and it asks
// for fewer: the same idea as the real retarget, which measures 2,016 blocks
// and aims for 10 minutes a block (bitcoin.org developer guide).
export const meetsDifficulty = (hashHex, zeros) => hashHex.startsWith("0".repeat(zeros));

export async function mine(header, zeros, hash, onGuess, isCancelled = () => false) {
  if (!Number.isInteger(zeros) || zeros < 0) throw new Error("zeros counts leading zero letters");
  let nonce = 0;
  for (;;) {
    if (nonce % 100 === 0 && isCancelled()) throw new Error("stopped");
    const h = await hash(`${header}${nonce}`);
    if (onGuess) onGuess(nonce, h);
    if (meetsDifficulty(h, zeros)) return { nonce, hash: h, guesses: nonce + 1 };
    nonce++;
    if (nonce > 5_000_000) throw new Error("too many guesses");
  }
}

// Too fast (under half the target pace) means harder; too slow (over double)
// means easier, never below 1 zero.
export function retarget(zeros, actualSecs, targetSecs) {
  if (actualSecs <= 0 || targetSecs <= 0) throw new Error("time moves forward");
  if (actualSecs * 2 < targetSecs) return zeros + 1;
  if (actualSecs > targetSecs * 2) return Math.max(1, zeros - 1);
  return zeros;
}
