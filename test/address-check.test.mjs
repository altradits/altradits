// Address Check: the offline Bitcoin address verifier. Official vectors
// (BIP173, BIP350, Bitcoin Core key_io, FIPS 180-4) run against the exact
// script the page ships, plus page, worker and no-network checks.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// The page's one inline script, run in Node. UI code stays out: it only runs
// where document exists. window exists so the frame check passes quietly.
function loadPageCore() {
  const html = read("address-check/index.html");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.equal(scripts.length, 1, "the tool ships exactly one inline script");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(scripts[0], sandbox, { filename: "address-check-inline.js" });
  assert.ok(sandbox.AddressCheck, "the inline script defines AddressCheck");
  return sandbox.AddressCheck;
}
const AC = loadPageCore();

test("SHA-256 matches FIPS 180-4 and node:crypto", () => {
  assert.equal(AC.sha256Hex(new Uint8Array(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "FIPS 180-4: empty string");
  assert.equal(AC.sha256Hex(AC.asciiBytes("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "FIPS 180-4: abc");
  for (const s of ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    "a".repeat(1000000), "abc".repeat(100)]) {
    assert.equal(AC.sha256Hex(AC.asciiBytes(s)), crypto.createHash("sha256").update(s, "ascii").digest("hex"), `cross-checked with node:crypto (${s.length} bytes)`);
  }
});

test("Base58 round-trips Bitcoin Core's codec pairs", () => {
  // src/test/data/base58_encode_decode.json (subset, leading zeroes included).
  const pairs = [["", ""], ["61", "2g"], ["626262", "a3gV"], ["636363", "aPEr"],
    ["73696d706c792061206c6f6e6720737472696e67", "2cFupjhnEsSn59qHXstmK2ffpLv2"],
    ["00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L"],
    ["516b6fcd0f", "ABnLTmg"], ["bf4f89001e670274dd", "3SEo3LWLoPntC"], ["572e4794", "3EFU7m"],
    ["ecac89cad93923c02321", "EJDM8drfXA6uyA"], ["10c8511e", "Rt5zm"], ["00000000000000000000", "1111111111"]];
  for (const [hex, b58] of pairs) {
    const bytes = new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
    assert.equal(AC.b58encode(bytes), b58, `encode ${hex.slice(0, 24)}`);
    assert.equal(Buffer.from(AC.b58decode(b58)).toString("hex"), hex, `decode ${b58.slice(0, 24)}`);
  }
});

test("BIP173 bech32 checksums verify, and its invalid strings throw", () => {
  for (const s of ["A12UEL5L", "a12uel5l",
    "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
    "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw",
    "11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j",
    "split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w", "?1ezyfcl"]) {
    assert.equal(AC.bech32Decode(s).encoding, "bech32", `valid: ${s.slice(0, 30)}`);
  }
  const bad = ["\x201nwldj5", "\x7f1axkwrx", "\x801eym55h",
    "an84characterslonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1569pvx",
    "pzry9x0s0muk", "1pzry9x0s0muk", "x1b4n0q5v", "li1dgmt3", "de1lg7wt\xff",
    "A1G7SGD8", "10a06t8", "1qzzfhee"];
  for (const s of bad) assert.throws(() => AC.bech32Decode(s), `invalid: ${JSON.stringify(s.slice(0, 24))}`);
});

test("BIP350 bech32m checksums verify, and its invalid strings throw", () => {
  for (const s of ["A1LQFN3A", "a1lqfn3a",
    "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
    "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
    "11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8",
    "split1checkupstagehandshakeupstreamerranterredcaperredlc445v", "?1v759aa"]) {
    assert.equal(AC.bech32Decode(s).encoding, "bech32m", `valid: ${s.slice(0, 30)}`);
  }
  const bad = ["\x201xj0phk", "\x7f1g6xzxy", "\x801vctc34",
    "an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4",
    "qyrz8wqd2c9m", "1qyrz8wqd2c9m", "y1b0jsk6g", "lt1igcx5c0", "in1muywd",
    "mm1crxm3i", "au1s5cgom", "M1VUXWEZ", "16plkw9", "1p2gdwpf"];
  for (const s of bad) assert.throws(() => AC.bech32Decode(s), `invalid: ${JSON.stringify(s.slice(0, 24))}`);
});

test("BIP173 and BIP350 segwit addresses decode to the published scriptPubKeys", () => {
  const vectors = [
    ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "0014751e76e8199196d454941c45d1b3a323f1433bd6", "mainnet", "P2WPKH"],
    ["tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7", "00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262", "testnet", "P2WSH"],
    ["tb1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesrxh6hy", "0020000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433", "testnet", "P2WSH"],
    ["bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y", "5128751e76e8199196d454941c45d1b3a323f1433bd6751e76e8199196d454941c45d1b3a323f1433bd6", "mainnet", "witness v1"],
    ["BC1SW50QGDZ25J", "6002751e", "mainnet", "witness v16"],
    ["bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs", "5210751e76e8199196d454941c45d1b3a323", "mainnet", "witness v2"],
    ["tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c", "5120000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433", "testnet", "P2TR"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "mainnet", "P2TR"],
  ];
  for (const [addr, spk, network, type] of vectors) {
    const r = AC.checkAddress(addr);
    assert.equal(r.ok, true, `${addr.slice(0, 24)} is valid`);
    assert.equal(r.scriptPubKey, spk, `${addr.slice(0, 24)} locking script`);
    assert.equal(r.canonical, addr.toLowerCase(), `${addr.slice(0, 24)} canonical form`);
    assert.equal(r.network, network, `${addr.slice(0, 24)} network`);
    assert.equal(r.type, type, `${addr.slice(0, 24)} type`);
  }
  // BIP173 wrote v1+ with the v0 checksum; BIP350 made that invalid.
  for (const addr of ["bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx", "BC1SW50QA3JX3S", "bc1zw508d6qejxtdg4y5r3zarvaryvg6kdaj"]) {
    const r = AC.checkAddress(addr);
    assert.equal(r.ok, false, `${addr.slice(0, 24)} is rejected`);
    assert.match(r.reason + r.detail, /Bech32m/, `${addr.slice(0, 24)} names Bech32m`);
  }
});

test("BIP350 invalid segwit addresses fail with the reason", () => {
  const vectors = [
    ["tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut", "Unknown prefix"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd", "Wrong checksum style"],
    ["tb1z0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqglt7rf", "Wrong checksum style"],
    ["BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL", "Wrong checksum style"],
    ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh", "Wrong checksum style"],
    ["tb1q0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq24jc47", "Wrong checksum style"],
    ["bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4", "not in the bech32 alphabet"],
    ["BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R", "Unknown witness version"],
    ["bc1pw5dgrnzv", "Wrong program length"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v8n0nx0muaewav253zgeav", "Wrong program length"],
    ["BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P", "Witness version 0 needs"],
    ["tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq", "Mixed upper and lower case"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v07qwwzcrf", "Broken bit grouping"],
    ["tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vpggkg4j", "Broken bit grouping"],
    ["bc1gmk9yu", "Empty data section"],
    ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", "Checksum does not match"],
  ];
  for (const [addr, want] of vectors) {
    const r = AC.checkAddress(addr);
    assert.equal(r.ok, false, `${addr.slice(0, 30)} is rejected`);
    assert.ok((r.reason + " " + r.detail).includes(want), `${addr.slice(0, 30)} says "${want}" (got: ${r.reason} ${r.detail})`);
  }
});
test("Bitcoin Core key_io addresses verify on every network", () => {
  // src/test/data/key_io_valid.json: every address entry with its scriptPubKey.
  const vectors = [
    ["1FsSia9rv4NeEwvJ2GvXrX7LyxYspbN2mo", "76a914a31c06bd463e3923bc1aadbde48b16976c08071788ac"],
    ["36j4NfKv6Akva9amjWrLG6MuSQym1GuEmm", "a914373b819a068f32b7a6b38b6b38729647cfde01c287"],
    ["mzK2FFDEhxqHcmrJw1ysqFkVyhUULo45hZ", "76a914ce28b26c57472737f5c3561a1761185bd8589a4388ac"],
    ["2NC2hEhe28ULKAJkW5MjZ3jtTMJdvXmByvK", "a914ce0bba75891ff9ec60148d4bd4a09ee2dc5c933187"],
    ["mww4LvqtTMKvmeQvizPz2EQv26xTneWrbg", "76a914b4110ba93ac54afc14da3bdd19614774a2d55d2988ac"],
    ["2N1r7aC69VHeE7yQJPDLi9T1PYq4wnwvjuT", "a9145e5a35ab44b3efaea5129ba22b88ba3e2976614587"],
    ["n4fajahJrAuKbN7uNsKjLjQkz9Qn5ewJXQ", "76a914fdeca3b08e38af53d7c4c60e3ad208ce5066441088ac"],
    ["2MxFajLApXpYk4VodBSZSt7rw8y4ryABkfA", "a91436e9f191e0b75036a77f65e2eaa4752443233fbe87"],
    ["bc1qvyq0cc6rahyvsazfdje0twl7ez82ndmuac2lhv", "00146100fc6343edc8c874496cb2f5bbfec88ea9b77c"],
    ["bc1qyucykdlhp62tezs0hagqury402qwhk589q80tqs5myh3rxq34nwqhkdhv7", "002027304b37f70e94bc8a0fbf500e0c957a80ebda87280ef58214d92f119811acdc"],
    ["bc1p83n3au0rjylefxq2nc2xh2y4jzz4pm6zxj4mw5pagdjjr2a9f36s6jjnnu", "51203c671ef1e3913f94980a9e146ba895908550ef4234abb7503d436521aba54c75"],
    ["bc1z2rksukkjr8", "520250ed"],
    ["tb1qcrh3yqn4nlleplcez2yndq2ry8h9ncg3qh7n54", "0014c0ef1202759fff90ff19128936814321ee59e111"],
    ["tb1quyl9ujpgwr2chdzdnnalen48sup245vdfnh2jxhsuq3yx80rrwlq5hqfe4", "0020e13e5e482870d58bb44d9cfbfccea78702aad18d4ceea91af0e022431de31bbe"],
    ["tb1p35n52jy6xkm4wd905tdy8qtagrn73kqdz73xe4zxpvq9t3fp50aqk3s6gz", "51208d2745489a35b75734afa2da43817d40e7e8d80d17a26cd4460b0055c521a3fa"],
    ["tb1rgv5m6uvdk3kc7qsuz0c79v88ycr5w4wa", "53104329bd718db46d8f021c13f1e2b0e726"],
    ["tb1q3vya2h5435jkugq2few7dmktlrwq4ejmfaw7kr", "00148b09d55e958d256e200a4e5de6eecbf8dc0ae65b"],
    ["tb1qxkhrl2s6ttrclckldruea0e8anhrehffl8xv7t0pdyrzm08v2hyqy408nf", "002035ae3faa1a5ac78fe2df68f99ebf27ecee3cdd29f9cccf2de169062dbcec55c8"],
    ["tb1pae5um27ahn8n73pgexe3kcwlp8dhswpn684h2k2w6t9a7w3eq65qephd5y", "5120ee69cdabddbccf3f4428c9b31b61df09db783833d1eb75594ed2cbdf3a3906a8"],
    ["tb1rx9n9g37az8mu236e5jpxdt0m67y4fuq8rhs0ss3djnm0kscfrwvq0ntlyg", "532031665447dd11f7c54759a48266adfbd78954f0071de0f8422d94f6fb43091b98"],
    ["bcrt1qdavt4j2sd7dlhqsavtnfxvzppw6k7qy97tmnu9", "00146f58bac9506f9bfb821d62e69330410bb56f0085"],
    ["bcrt1qan8gntac7z7me2ejt4hpru42ad2f759fmy0m3ejvs98656znv7eqga4uhv", "0020ecce89afb8f0bdbcab325d6e11f2aaeb549f50a9d91fb8e64c814faa685367b2"],
    ["bcrt1pfwxjqvtt4tcxrtdluukfmy2dv7xd2qzdfy6kajv5nwn4yam3wxkq3553uh", "51204b8d20316baaf061adbfe72c9d914d678cd5004d49356ec9949ba752777171ac"],
    ["bcrt1sx6p8njlx7h9mc2agz4yg82dzne23050ncq72cneeecez2pst8mahn8xecsf8g6hzx94420", "6028368279cbe6f5cbbc2ba8154883a9a29e5517d1f3c03cac4f39ce3225060b3efb799cd9c412746ae2"],
    ["1FjL87pn8ky6Vbavd1ZHeChRXtoxwRGCRd", "76a914a19331b7b2627e663e25a7b001e4c0dcc5e21bc788ac"],
    ["3BZECeAH8gSKkjrTx8PwMrNQBLG18yHpvf", "a9146c382dcdf5b284760c8e3fead91f7422cd76aa8787"],
    ["n4YNbYuFdPwFrxSP8sjHFbAhUbLMUiY9jE", "76a914fc8f9851f3c1e4719cd0b8e4816dd4e88c72e52888ac"],
    ["2NAeQVZayzVFAtgeC3iYJsjpjWDmsDph71A", "a914bedc797342c03fd7a346c4c7857ca03d467013b687"],
    ["mnCBpkNMJEJLehgdEkzSo2eioniyJMxLpZ", "76a914493c455551e48a1423263b62b127b436106a685488ac"],
    ["2N5sNHomeNJDZv67AcFx9ES7FBZY4jx9KDA", "a9148a776a0f34d56b63e7c595f2b205dbe1c393617a87"],
    ["mfhE6jAUwjUDNZhaX1PAsDTKfneQF2Nshc", "76a91401f15a4cc063dae4f4d56b89bfbc8bcc9ae5387c88ac"],
    ["2MxNm1VHyVU4RuP3u1c1v5aQLk2dQjwy1Qk", "a91438456f7c076356abadcc67b92ad777eb20fb9f8887"],
    ["bc1qhxt04s5xnpy0kxw4x99n5hpdf5pmtzpqs52es2", "0014b996fac2869848fb19d5314b3a5c2d4d03b58820"],
    ["bc1qgc9ljrvdf2e0zg9rmmq86xklqwfys7r6wptjlacdgrcdc7sa6ggqu4rrxf", "0020460bf90d8d4ab2f120a3dec07d1adf039248787a70572ff70d40f0dc7a1dd210"],
    ["bc1pve739yap4uxjvfk0jrey69078u0gasm2nwvv483ec6zkzulgw9xqu4w9fd", "5120667d1293a1af0d2626cf90f24d15fe3f1e8ec36a9b98ca9e39c6856173e8714c"],
    ["bc1zmjtqxkzs89", "5202dc96"],
    ["tb1ql4k5ayv7p7w0t0ge7tpntgpkgw53g2payxkszr", "0014fd6d4e919e0f9cf5bd19f2c335a03643a914283d"],
    ["tb1q9jx3x2qqdpempxrcfgyrkjd5fzeacaqj4ua7cs7fe2sfd2wdaueq5wn26y", "00202c8d1328006873b098784a083b49b448b3dc7412af3bec43c9caa096a9cdef32"],
    ["tb1pdswckwd9ym5yf5eyzg8j4jjwnzla8y0tf9cp7aasfkek0u29sz9qfr00yf", "51206c1d8b39a526e844d324120f2aca4e98bfd391eb49701f77b04db367f145808a"],
    ["tb1r0ecpfxg2udhtc556gqrpwwhk4sw3f0kc", "53107e7014990ae36ebc529a4006173af6ac"],
    ["tb1q6mwf89hnqhlu8txjgjfs4s7p93ugffn3k062ll", "0014d6dc9396f305ffc3acd244930ac3c12c7884a671"],
    ["tb1qafrjalu4d73dql0czau9j6z422434kef235mzljf48ckd5xz3sys09jm97", "0020ea472eff956fa2d07df8177859685552ab1adb295469b17e49a9f166d0c28c09"],
    ["tb1pwst9qszjrhuv2e7as0flcq9gm698v6gdxzz9e87p07s8rssdx3zqklm3vf", "512074165040521df8c567dd83d3fc00a8de8a76690d30845c9fc17fa071c20d3444"],
    ["tb1r3ss76jtsuxe8c8c8lxsehnpak55ylrgr345pww076l536ahjr6jsydamx3", "53208c21ed4970e1b27c1f07f9a19bcc3db5284f8d038d681739fed7e91d76f21ea5"],
    ["bcrt1q65nhlm4hf2ptg3t264al57p7wjxj2c3s6kyt83", "0014d5277feeb74a82b4456ad57bfa783e748d256230"],
    ["bcrt1qawvc90lpytw3z3k9etdx54l0exq5f5sqfzu5e45kjnl6slwayeeqx2dyac", "0020eb9982bfe122dd1146c5cada6a57efc98144d20048b94cd69694ffa87ddd2672"],
    ["bcrt1p39a4s4vdcw9kqa8w2t0rp7aj8kfxyw7mce5sk5d70x6wnnmpvt7skf2kxy", "5120897b58558dc38b6074ee52de30fbb23d92623bdbc6690b51be79b4e9cf6162fd"],
    ["bcrt1s489d9fhmyel0vzfqsrmew4x7r80asuqesm5hgqacy35daflcyufh3j8cgdtflvt99ph05m", "6028a9cad2a6fb267ef6092080f79754de19dfd8701986e97403b82468dea7f8271378c8f843569fb165"],
    ["1G9A9j6W8TLuh6dEeVwWeyibK1Uc5MfVFV", "76a914a614da54daacdb8861f451a0b7e3c27cdf8a099e88ac"],
    ["33GA3ZXbw5o5HeUrBEaqkWXFYYZmdxGRRP", "a914113ca1afeb49ff3abf176ffa19c2a2b4df19712a87"],
    ["mwgS2HRbjyfYxFnR1nF9VKLvmdgMfFBmGq", "76a914b14ce7070b53cb0e4b5b5f6e253e876990aeca2e88ac"],
    ["2MwBVrJQ76BdaGD76CTmou8cZzQYLpe4NqU", "a9142b2c149cde619eae3d7fe995243b76a3417541aa87"],
    ["mfnJ8tEkqKNFE5YaHTXFxyHk2mnDK2fvDh", "76a91402e6cd77e649ad8b281271f158fc964ca3f66cb088ac"],
    ["2My83D67ir7K8PPzeT6mE2oth3ZwNTVRS9F", "a9144074d84d32ff62da7b1b3c61925b934bfeb34b0587"],
  ];
  assert.equal(vectors.length, 54, "all 54 Core address entries are embedded");
  for (const [addr, spk] of vectors) {
    const r = AC.checkAddress(addr);
    assert.equal(r.ok, true, `${addr.slice(0, 24)} is valid`);
    assert.equal(r.scriptPubKey, spk, `${addr.slice(0, 24)} locking script`);
    assert.equal(r.canonical, addr, `${addr.slice(0, 24)} re-encodes identically`);
    // Expected labels from the address prefix and Core's own script, not ours.
    let network, type;
    if (addr.startsWith("1")) [network, type] = ["mainnet", "P2PKH"];
    else if (addr.startsWith("3")) [network, type] = ["mainnet", "P2SH"];
    else if (/^[mn]/.test(addr)) [network, type] = ["testnet", "P2PKH"];
    else if (addr.startsWith("2")) [network, type] = ["testnet", "P2SH"];
    else {
      network = addr.startsWith("bcrt") ? "regtest" : addr.startsWith("bc") ? "mainnet" : addr.startsWith("tb") ? "testnet" : "regtest";
      if (spk.startsWith("0014")) type = "P2WPKH";
      else if (spk.startsWith("0020")) type = "P2WSH";
      else if (spk.startsWith("5120")) type = "P2TR";
      else type = `witness v${parseInt(spk.slice(0, 2), 16) - 0x50}`;
    }
    assert.equal(r.network, network, `${addr.slice(0, 24)} network`);
    assert.equal(r.type, type, `${addr.slice(0, 24)} type`);
  }
});

test("Bitcoin Core key_io invalid strings are all rejected", () => {
  // src/test/data/key_io_invalid.json in full. Core demands invalid on all
  // four networks; the tool rejects them outright. None is a usable key.
  const invalid = ["", "x",
    "1GAdfviErV2Ew95FPtZyikz2qGP3gyCB6Hyu94sedAkPpA523m3fQwps9YKUZkKgQckGPKhRsFR",
    "37G2kMDLpmWVhimxRdzwNfE8JFvWXnJYnVcXeeGrek2qumdJuK7XArcVVpRtLLjRra3t64BEPF2",
    "giymtio7u7oqWtmC9YnvAEKkLF3JQpAdkEFkVJKYrVDfaLbhaDpX1ihfF2vZmya1i61fwLPC3YQ",
    "8iVk9nLM3nYwRuwypjy9NK5rsuZH7BbrQRZ1pgcQmvMnjAgRXD",
    "cPTVQ1hbo4qdoysf6Jx5GthqucNmdfqt6J2pZRFeXv8Ep7Kmjqud",
    "cQbR2Ny85XFBzUMx3Ed6HsTLw2pVruSgPvt5AofnBUnhiv86gYeW",
    "2UB3iG3VJbX2TRrMwm6ssWskgvU9VjFBYSqCzwqkrihCwo7mg4mtS4WuGZgxTKuxf5A3EcotYEymz",
    "cQe12pqwPR6ExtZKfrKf1q4b3CTh1Qi7MwuvMvzs79nWXDvESfBJ",
    "tc1qeul5g2xfkvdkrhcfmdursv73ad64jnkjl9c40f",
    "bt1pq65rzej5glw3ra79gav6fqnx4haa0z257qr3mc8cggkefahmgvyseufhc0",
    "tb13hty4qmumlwpp6chxjvcyzza4duqgtmxw3xhm3u9ahj4nyhtwz8eq7ynrj4",
    "bcrt1r2qxpwuge",
    "bc10uexgzna2dpfk0vjt35srz6a27ps6m0l89jweznt83n2sqn2fx4hvn9ym5af8wut34sfrqhk3",
    "tb1qum6uh0pt4q253qaf520929737v63w5gf",
    "bcrt1q888ryfgxpvl0k7vum8zpyar2u2sexvdhkf38ue37yknmqq0ycrwpl3w48y",
    "bc1qdsuzmn04k2z8vryw8l4dj8m5ygqgnne5n",
    "tb1qlj8es50nc8j8r8xshrjgzmw5azx89efghmw8ju6zcqla0g6xcnrstsjz7k",
    "bcrt1qzwmyj0z924g7fzs5yvnrkc43y76RVyr2lh5t4r",
    "bc1qpu6d26mrulzetu4jqhd7rsunv9aqru26f5c4j8",
    "tb1qun6d26ufh77ghny6u5u8cwz9da7qwc6k4wkuceae9tth06eqlw0syupl4w",
    "bcrt1qj7g2jps453kj9htk9cxyyc2nxe69x4kzzmth7v",
    "bc1p702xksx4z3uqf0u2phllxkfe5cgu0adxptqs0uelx0tqt8e885sqryes2l",
    "tb1z7gmh0v6pc30z4xum76lmw8w86yswrlmw",
    "bcrt1sjsrw6nun4h502cr97xmnyyuhkr22q0s6efrgtu",
    "2UVPFpGYnLHJezFzjUo42our6PMEoozzRdM",
    "2MygHQjE1U33q3LSC53p69YqFjP8PihumJAF",
    "KzNbAQ4mexfAxa6RKBzHQqfoTycaeWpv2p",
    "2jDPrDfAKihCGPbPD9ztY8TswAia4V8Bc6vx",
    "4VQUNG1hG64QFtaNyQZQWDdwpxB275Pwb3tvyPt2HDxB8Mi2MgH8Tz3AC83YYiz9LydsLNXEZJLHY",
    "39TKsUQ5QpEL1wowc6GMUqak94ijirPuP69ooV3xsFmiKQX2dau",
    "2UEJjT3dSdwc8dAo7oedPzznXceXCEsBbDfAvSymqpqDrkZMv7JBEUpLyhkghioYAWC9W4sKysry",
    "7VmMEkphxCFSV1y659Th4dkk6x6bJS5eQvbt8rzUYKQyd6ACgwQ4vXHtXKFUwP2kW3XULipnHJdZ7",
    "tc1qdlapns4zkn03juf2k9xwwpct209suj6mgcd9gh",
    "bt1psa5eptk29c4jc9yumeseat3a0l5e2fpmw635za2p4gpwdnthueysxga9je",
    "tb13w8c43lykfj3lvm9sgp6dsnfjla3d57cm83seykunf0ltxjc9lt2q4efm4d",
    "bcrt1rjqr2tdkm",
    "bc10lyxwnxa70l270e6fcmxr4x7dtgu2yvy7gzkurwxy4zhdvgaqrrn6pfg2flyhqzy5t5se8yu3",
    "TB1QFDFM763VXVSUNZHQLPWC0Q8FG5LJX6ZN",
    "bcrt1q60chha7wfwlau4kdr4mlvyeyc8mnnh9dhxk05e0hmrxcuhghefj36uwyha",
    "bc1gmk9yu",
    "tb1ly0q7p",
    "bcrt1qdwttaw38uf42wxw40kwk3u8nguyTQH3hx6jmqp",
    "bc1qtsvlht6730n04f2mpaj5vv8hrledn5n5ug8c79",
    "tb1dclvmr",
    "bcrt1q3fqvctqu48wsvggrt09vj0yk2gzzcscdp4h98u",
    "bc1prklpq7tjcawg89cmwwqr3u5apwav36xa4zz56ady7crsllm6mpnqts7p86",
    "tb1zkm58zyhxz3ffkfgsyprflg543slsl4c4",
    "bcrt1snzr5kaypnfhpnjanrhd20fhqcjxm3hfh7dw9fu",
    "2GgnYKqBGuA2Mm5GnrPsMTZR81xPhNtgMYoFUZngZGiobhCuUpCaTriUHRcgFreEekNdPAR17q8d",
    "AZEah8d1EK362okRBS66e8SvdtYkrE8tsX",
    "gep8xr77FyPW6zYP15RiV9W8nL6w2HyHB16cUDakfyDceMA6ZzUdhJjk2LPuLYHnLkBqkRTTi6z",
    "2NDNP7GY59tTJPZTpbkprhM9SR99Nn5rUs7",
    "2Csgzy2T287YAjeU5tFtt1nPshBZAUFQi4WtgaWyZGKSBNnKXHy2Tmxo8QK4Mfdds977ShcDWC5o",
    "Kwjk3Vy6sdXMQDGWJzaWmqFxUNtWZCX1q4F4Kpt8jNNUoWJUUaTY",
    "Svj8kk98bAS9V4L2crmxakbhmnPm3cJ1tJ4Je4yVzDreU8eSTFURS1SPYv5oWEQD8Q9VBDvx5uF",
    "KNYsv6v9GtkGeD4WdQnBEJCrPKQm91PTxAbCfXr66LEd4JDmhPWC",
    "2UJ2H2xvAeXmFKfQwMyDoSdQTTPFMNCT3SsoUafBWKzoGP3NsUK1buEgQZG38viyD53jgMdpqfT7",
    "6aLMfayKF4TW4ecn5SEc8FExpyJA2peKxYRGZhes6tQ4NTTzuGy",
    "7VP4FmcebU2thJns9MnXde7LWfuqR5vMizrAuUoq2GcJjzTyA4RHFcPVdZL8PLg1SbpSFdJrvLXoY5",
    "tc1q5qdvt99uc92jyz663dtdpfpv6nr67ahmgwcpq2",
    "bt1peu3ppd7x796sjjenp09r8cs22rhylqm9lhggk72qp8q22vzft0wq2a0x6j",
    "tb1323z3lnz7dl3kd0nsuh6xy4he9almzl67anxgg3xdzkaxc9rwntlqdhdzd7",
    "bcrt1r2gc42sky",
    "bc10fd889x4hd54tqu2ewg9t4hhft2wl7m6x50av4uswzw46xe6as0xmltfg7vrjfkvm459vld7w",
    "TB1QZY7V0F2AT3308YGGNGN66ULJTCN3RY6F",
    "bcrt1qjg3cwht92znyw0l4r5rtctmls337nrc7g0ry9drjxmlecjd3atl3fake7c",
    "bc1qmgf8xt8xkecl79k04mma3lz34gqep7hg4",
    "TB1Q3F9WGNXE9ZMTTMDN5VKVKHYZ8Y0LCV72YV7V5LSXTJXEYHNHEHASLYL0TZ",
  ];
  assert.equal(invalid.length, 70, "all 70 Core invalid entries are embedded");
  for (const s of invalid) {
    assert.equal(AC.checkAddress(s).ok, false, `rejected: ${JSON.stringify(s.slice(0, 30))}`);
  }
});

test("everyday pastes: genesis, typos, links, lookalikes and odd shapes", () => {
  const genesis = AC.checkAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
  assert.equal(genesis.ok, true, "the genesis address verifies");
  assert.equal(genesis.type, "P2PKH", "genesis is P2PKH");
  assert.equal(genesis.network, "mainnet", "genesis is mainnet");
  // The payload is bound to the address by the checksum above: a wrong
  // string on either side would fail to verify.
  assert.equal(genesis.payload, "62e907b15cbf27d5425399ebf6f0fb50ebb88f18", "genesis hash160");
  const typo = AC.checkAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb");
  assert.equal(typo.ok, false, "one wrong character fails");
  assert.equal(typo.reason, "Checksum does not match.", "a typo names the checksum");

  assert.equal(AC.checkAddress("").reason, "Nothing pasted yet.", "empty input");
  assert.equal(AC.checkAddress("   ").reason, "Nothing pasted yet.", "blank input");
  assert.equal(AC.checkAddress("  bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4\n").ok, true, "surrounding whitespace is trimmed");
  assert.equal(AC.checkAddress('"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"').ok, true, "surrounding quotes are stripped");
  const spaced = AC.checkAddress("bc1qw508 d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
  assert.equal(spaced.reason, "A space broke the address.", "inner whitespace is located");

  const uri = AC.checkAddress("bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.001&label=Stan&message=Q1%20dues");
  assert.equal(uri.ok, true, "a BIP21 link checks its address");
  assert.equal(uri.uri.amount.sats, "100000", "BIP21 amount in sats");
  assert.equal(uri.uri.label, "Stan", "BIP21 label");
  assert.equal(uri.uri.message, "Q1 dues", "BIP21 message is decoded");
  assert.equal(AC.checkAddress("BITCOIN:BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4").ok, true, "upper-case link and address");
  assert.equal(AC.checkAddress("bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.000000001").uri.amount.error, "0.000000001", "nine decimals is not a valid amount");
  assert.ok(AC.checkAddress("bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=21000001").uri.amount.error, "over 21 million coins is not a valid amount");
  assert.equal(AC.checkAddress("bitcoin:?amount=1").reason, "The link has no address.", "a link without an address");

  // Synthetic shapes only: no real key material in this file.
  assert.match(AC.checkAddress("5" + "1".repeat(50)).reason, /private key/, "WIF-shaped text warns");
  assert.match(AC.checkAddress("lnbc10u1p389j8pp5rl0x9x8gf2tvdw0s3jn54khce6mua7lqqqp").reason, /Lightning invoice/, "an invoice is redirected");
  assert.match(AC.checkAddress("4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b").reason, /64 hex/, "a bare hash is redirected");
  const zero = AC.checkAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN0");
  assert.ok(zero.hint.includes("leaves out"), "a 0 hints at lookalike letters");
  const bee = AC.checkAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3tb");
  assert.ok(bee.hint.includes("b, i and o") || /Checksum|alphabet/.test(bee.reason + bee.detail), "a b in bech32 hints at the alphabet");
  assert.equal(AC.checkAddress("x".repeat(201)).reason, "Far too long.", "absurd length is rejected");
});

test("pay-to-anchor and future v1 programs follow Bitcoin Core", () => {
  // Shapes from Core's IsPayToAnchor (OP_1, 2 bytes 0x4e73) and
  // WitnessUnknown; the decode path below is the tool's own.
  const p2a = AC.checkAddress("bc1pfeessrawgf");
  assert.equal(p2a.ok, true, "P2A verifies");
  assert.equal(p2a.type, "P2A", "P2A is named");
  assert.equal(p2a.scriptPubKey, "51024e73", "P2A locking script");
  const v1 = AC.checkAddress("bc1pqqqsyqcyq5rqwzqfpg9scrgwpugpzysntwgkaa");
  assert.equal(v1.ok, true, "v1 with 20 bytes stays valid, like Core's WitnessUnknown");
  assert.equal(v1.type, "witness v1", "v1 with 20 bytes is not P2TR");
});

test("the page carries a fresh policy, the frame check and the reporter", async () => {
  const { withPolicy } = await import("../deploy/page-csp.mjs");
  const html = read("address-check/index.html");
  assert.equal(withPolicy(html), html, "address-check/index.html: policy missing or stale (same format as deploy/page-csp.mjs writes)");
  assert.match(html, /window\.top !== window\.self/, "the tool refuses to load inside a frame");
  assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, "the Security watch reporter is loaded");
  assert.match(html, /connect-src 'self'/, "the tool calls only this site");
  assert.doesNotMatch(html, /connect-src 'self' https?:/, "no API host beside this site");
});

test("the tool makes no network requests after load", () => {
  // Static proof, run in CI where no browser exists: the shipped code has no
  // network API at all, so after the page loads nothing can be requested. A
  // headless-browser pass with a request log is done before each release.
  const html = read("address-check/index.html");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const sw = read("address-check/sw.js");
  for (const api of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "importScripts"]) {
    assert.ok(!inline.includes(api), `address-check/index.html: no ${api} (nothing to request with)`);
  }
  // The worker fetches only same-origin shell files at install (proved
  // same-site by the worker test below); it holds no other network API.
  for (const api of ["XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "importScripts"]) {
    assert.ok(!sw.includes(api), `address-check/sw.js: no ${api}`);
  }
  for (const [file, src] of [["address-check/index.html", inline], ["address-check/sw.js", sw]]) {
    for (const store of ["localStorage", "sessionStorage", "document.cookie"]) {
      assert.ok(!src.includes(store), `${file}: no ${store} (inputs are never kept)`);
    }
  }
  const noFrameCheck = inline.replace('document.documentElement.innerHTML = "";', "");
  assert.ok(!noFrameCheck.includes("innerHTML"), "address-check/index.html: results are built with textContent, never innerHTML");
  assert.doesNotMatch(html, /src="http/, "no outside scripts, styles or images");
  for (const [tagXml, tag, href] of html.matchAll(/<(a|link|script|img)\b[^>]*href="(http[^"]*)"/g)) {
    if (tag === "link" && tagXml.includes('rel="canonical"') && href.startsWith("https://altradits.com/")) continue; // crawler metadata, same site
    assert.equal(tag, "a", `<${tag}> loads ${href} (only plain links may leave the site)`);
  }
  assert.match(html, /<form[^>]*action="#"/, "the form posts nowhere");
  assert.doesNotMatch(html.match(/<textarea[^>]*>/)[0], /name=/, "the address field has no name, so even a bare submit sends nothing");
  assert.match(inline, /addEventListener\("pagehide"/, "the input clears when the page hides");
});

test("the worker precaches the tool, serves same-site reads, and falls back to the tool", () => {
  const sw = read("address-check/sw.js");
  assert.match(sw, /const CACHE = "address-check-v\d+"/, "a versioned cache of its own (bump it when cached files change)");
  const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const u of shell) {
    const p = u === "/address-check/" ? "address-check/index.html" : u.replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(root, p)), `sw.js: precached ${u} exists (one 404 breaks the whole install)`);
    assert.ok(u === "/address-check/" || u.startsWith("/address-check/"), `sw.js: precached ${u} stays inside the tool's scope`);
  }
  for (const f of ["address-check/index.html"])
    assert.ok(shell.includes(`/${f}`) || shell.includes("/address-check/"), `sw.js: ${f} is precached (a forgotten file breaks offline use)`);
  assert.match(sw, /u\.origin !== self\.location\.origin/, "same-site reads only");
  assert.match(sw, /ev\.request\.method !== "GET"/, "only reads go through the cache (reports pass through)");
  assert.match(sw, /caches\.match\("\/address-check\/"\)/, "failed reads fall back to the tool");
  assert.match(read("address-check/index.html"), /navigator\.serviceWorker\.register\("\/address-check\/sw\.js"\)/, "the tool installs its worker");
});

test("single file: no dependencies beside the reporter", () => {
  const html = read("address-check/index.html");
  for (const [, src] of html.matchAll(/<script[^>]*src="([^"]*)"/g)) {
    assert.equal(src, "/assets/report.js", `only the reporter loads beside the page (got ${src})`);
  }
  assert.doesNotMatch(html, /<link[^>]*rel="stylesheet"/, "no outside stylesheets (save the file and it still works)");
  assert.doesNotMatch(html, /<img\b/, "no images to load");
});

test("wiring: the server, Apache and the sitemap serve the tool", () => {
  const srv = read("server.mjs");
  assert.ok(srv.includes("address-check\\/(?:index\\.html|sw\\.js)"), "server.mjs PUBLIC serves the tool shell");
  assert.ok(srv.includes('"/address-check/index.html"'), "server.mjs maps /address-check/ to the tool");
  assert.ok(srv.includes("`/address-check/${url.search}`"), "server.mjs sends the bare path to the trailing slash");
  const ht = read(".htaccess");
  assert.ok(ht.includes("RewriteRule ^address-check$ /address-check/ [R=301,L]"), ".htaccess sends the bare path to the trailing slash");
  assert.ok(ht.includes("RewriteRule ^address-check/(index\\.html)?$ address-check/index.html [L]"), ".htaccess serves the tool on the Apache stack");
  const sm = read("sitemap.xml");
  assert.match(sm, /<loc>https:\/\/altradits\.com\/address-check\/<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/, "sitemap lists the tool with a date");
});

test("page copy: honest, plain words, no em-dashes", () => {
  const html = read("address-check/index.html");
  assert.doesNotMatch(html, /—/, "no em-dashes (house style)");
  assert.doesNotMatch(read("address-check/sw.js"), /—/, "no em-dashes in the worker");
  assert.ok(html.includes("A scammer's address is valid too"), "the checksum limit is stated");
  assert.ok(html.includes("Nothing leaves your browser"), "the privacy promise is stated");
  assert.ok(html.includes("never needs a private key"), "the private-key rule is stated");
  assert.match(html, /<title>[^<]*Bitcoin address checker[^<]*<\/title>/, "the title answers the real query");
});

