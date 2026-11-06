// Sats Safari: blocks and the chain. A block carries its number, its
// transactions and the fingerprint (hash) of the block before it. The first
// block points at "start". Hashing is injected: an async (text) => hex
// function, so the game uses Web Crypto and the tests use node:crypto.
// The header encoding is simplified for the game; real blocks hash an
// 80-byte header (bitcoin.org developer guide: block chain).
export const GENESIS_PREV = "start";

// One line of text that stands for the block. Change any letter and the
// fingerprint changes completely.
export function headerText(block) {
  return `${block.n}|${block.txs.join(",")}|${block.prev}`;
}

export async function seal(block, hash) {
  return { ...block, hash: await hash(headerText(block)) };
}

// Every fingerprint must match its block, and every block must point at the
// fingerprint before it (whitepaper section 3: each timestamp includes the
// one before it).
export async function validChain(chain, hash) {
  if (!Array.isArray(chain) || !chain.length) return { ok: false, at: 0, why: "empty" };
  let prev = GENESIS_PREV;
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    if (b.prev !== prev) return { ok: false, at: i, why: "link" };
    if (b.hash !== (await hash(headerText(b)))) return { ok: false, at: i, why: "hash" };
    prev = b.hash;
  }
  return { ok: true };
}

// Swap one transaction, keeping the old fingerprint: the demo of tampering.
export function tamper(block, index, tx) {
  const txs = block.txs.slice();
  txs[index] = tx;
  return { ...block, txs };
}

// Whitepaper section 5: nodes always take the longest valid chain. Every
// game block carries the same pretend work, so longest means most work here.
export function longestValid(chains) {
  let best = -1;
  chains.forEach((c, i) => {
    if (c.valid && (best < 0 || c.blocks > chains[best].blocks)) best = i;
  });
  return best;
}

// SHA-256 through Web Crypto. Works in browsers and in Node 19+.
export async function webHash(text) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
