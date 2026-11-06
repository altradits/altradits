# Address Check: verify any Bitcoin address before sending

Live at `/address-check/`. Issue: #423.

## Choice (why this problem)

Every on-chain payment starts with one fragile step: copying the destination address. Two threats have hit users for years. First, typos and copy errors: every address format carries a checksum, but most wallets answer only yes or no and never show what the address pays to. Second, substitution: clipper malware silently swaps a copied address for the attacker's (documented in the Electrum malware guide since 2017), and address-poisoning lookalikes match the first and last characters most people check (Chainalysis 2024 campaign analysis; Elliptic explainer; 2025-26 reports of Electrum and Phantom lookalike scams). Today's answers are weak: block explorers work online and learn which address you care about; bitcoin-cli validateaddress needs a full node and a terminal; web validators ask you to trust a site with your data and often lag on new formats (P2TR, future witness versions). Address Check verifies any address in the user's own browser, fully offline, from first principles: Base58Check per Bitcoin Core base58.cpp, bech32 per BIP173, bech32m per BIP350. It shows the network, the type (P2PKH, P2SH, P2WPKH, P2WSH, P2TR), the exact locking script, and the re-encoded address grouped for character-by-character comparison.

## How it follows Satoshi's principles

- No trusted third party: every check runs in the user's own browser. The page makes no network requests after load (static test in test/address-check.test.mjs, plus a headless-browser check before release). No API calls, no analytics on inputs, no remote fonts or scripts. A service worker (scope `/address-check/`) makes it work fully offline, and the page is one self-contained file that can be saved and opened locally.
- Verify, don't trust: the result shows the evidence, not just a verdict. Format, checksum recomputed and compared, network, address type, the exact locking script (hex and ASM), and the address re-encoded from the decoded payload so any difference from the pasted text is visible.
- Privacy: no accounts, nothing stored (no localStorage, no cookies from the tool), the input clears when the page hides, and nothing pasted ever leaves the device.
- Primary sources for every rule, cited on the page: BIP13 (P2SH version bytes), BIP16 (P2SH), BIP141 (witness program rules for v0), BIP173 (bech32), BIP350 (bech32m, v1+ rules), BIP21 (bitcoin: URIs), Bitcoin Core src/base58.cpp, src/key_io.cpp and src/test/data/key_io_valid.json, FIPS 180-4 (SHA-256). Test vectors come from these sources, not from memory.

## Rules the tool applies

| Input | Rule | Source |
| :--- | :--- | :--- |
| `1...` `3...` `m/n...` `2...` | Base58Check: decode, version byte in {0x00, 0x05, 0x6f, 0xc4}, checksum is first 4 bytes of double SHA-256 | Core base58.cpp, BIP13 |
| `bc1...` `tb1...` `bcrt1...` v0 | bech32 checksum (constant 1), program 20 bytes (P2WPKH) or 32 bytes (P2WSH) | BIP173, BIP141 |
| `bc1p...` etc. v1, 32 bytes | bech32m checksum (constant 0x2bc830a3), P2TR | BIP350, BIP341 |
| v2 to v16 | bech32m checksum, program 2 to 40 bytes, shown as future witness version | BIP350 |
| `bitcoin:...` | scheme stripped, address checked, amount shown in sats if present | BIP21 |
| anything else | rejected with the reason and the exact position of the first bad character | |

Networks: `bc` is Bitcoin mainnet. `tb` is shared by testnet3, testnet4 and signet. `bcrt` is regtest. Version bytes 0x00/0x05 are mainnet P2PKH/P2SH; 0x6f/0xc4 are testnet P2PKH/P2SH (same sharing as `tb`).

## Honest limits (shown on the page)

- A valid checksum stops typos, not substitution. A scammer's address is valid too. The page says this and teaches full comparison, because lookalikes match the ends.
- The tool cannot tell who owns an address. It shows what the address pays to, never whom.
- Private keys are never needed here. Pasted text shaped like a private key gets a warning and no further handling.

## Files

- `address-check/index.html`: the whole tool. Inline CSS and JS, no dependencies. The script has two parts: a pure checker (no DOM, also run by the tests in Node) and the page UI.
- `address-check/sw.js`: offline shell. Versioned cache, same-site reads only, falls back to the tool.
- `test/address-check.test.mjs`: BIP173, BIP350 and Core key_io vectors, FIPS 180-4 SHA-256 vectors cross-checked against node:crypto, page and worker checks, no-network test.
- `assets/address-check-shot.png`: real headless screenshot for the portfolio card.

## Verify

- `npm test` runs the full suite including the vectors.
- Offline: open `/address-check/`, go offline, reload. It still checks.
- Single file: save the page as HTML only, open it with no internet. It still checks (the install-time worker and the analytics-free reporter simply stay out).
- No network: with the network log open, paste and check addresses. After the page loads, nothing is requested.

## Language

English only for now. Kiswahili waits until a speaker reviews the wording, because wrong security words are worse than English ones.
