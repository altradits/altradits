// Kazi board: a moderated noticeboard of small paid tasks for Kisumu people.
//
// Anyone posts a task; nothing goes public until Stanley approves it. A
// Kisumu worker answers through the posted contact, does the task, and the
// poster pays them directly, peer to peer, in sats or M-Pesa. Kazi never
// holds money, takes no cut and converts nothing: payments happen off the
// board, so no payment data is ever asked for or stored.
//
//   kz:<id>      task { id, title, desc, reward, unit, location, poster,
//                       contact, status, flags, screenReasons, createdAt,
//                       approvedAt, closesAt, closedAt, closeReason, paidHow,
//                       manageHash, agreedTerms }
//   kzs:open     list of open task ids (newest first)
//   kzs:pending  list of pending task ids (newest first)
//   kzf:<id>     list of flag reasons (newest first, only the first 20 kept)
//
// Switched on with KAZI=on (off: posting, managing and listing all refuse).
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, deleteKeys, removeFromList, keysWithPrefix } from "./store.js";
import { oneLine, clean } from "./http.js";
import { switchOn } from "./ywallet.js";
import { screen } from "./screen.js";

export const kaziOn = () => switchOn("KAZI");
// The board rules at /kazi#terms. Posting stores this version with the time
// it was agreed to. A change to the rules gets a new version here and on the
// page together.
export const KAZI_TERMS_VERSION = "2026-11-06";
// The pilot help contact (a phone number or email Stanley sets in env),
// shown as plain text on the board. Null when unset.
export const kaziHelp = () => clean(process.env.KAZI_HELP || "", 120).replace(/\s+/g, " ").trim() || null;
const maxOpen = () => Math.max(1, Number(process.env.KAZI_MAX_OPEN) || 20);
const maxPending = () => Math.max(1, Number(process.env.KAZI_MAX_PENDING) || 50);
const taskDays = () => Math.max(0, Number(process.env.KAZI_TASK_DAYS ?? 30) || 0);

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString("base64url");
export const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export const UNITS = ["KES", "SATS"];
const PAID_HOW = ["sats", "kes", "unpaid", "unknown"];

function checkFields(b, what = "post") {
  const need = (v, max, name) => {
    const s = oneLine(v, max);
    if (!s) throw err(`${name} is needed.`);
    return s;
  };
  const desc = clean(b.desc, 2000);
  if (!desc) throw err("Say what needs doing.");
  const reward = Number(b.reward);
  if (!Number.isInteger(reward) || reward < 1 || reward > 100_000_000) throw err("The reward must be a whole number from 1 to 100,000,000.");
  if (!UNITS.includes(b.unit)) throw err("The reward is in KES or SATS.");
  const task = { title: need(b.title, 100, "A title"), desc, reward, unit: b.unit,
    location: need(b.location, 60, "Where in Kisumu"), poster: need(b.poster, 60, "Your name"), contact: need(b.contact, 120, "A contact line") };
  if (what === "post" && b.agree !== true) throw err("Tick 'I agree' to the board rules first.");
  return task;
}

// Every task's words are screened on the way in (contact-shield playbook):
// links, code, scripts and payment strings are stored as advisory reasons
// for Stanley. Everything already waits for his approval, so a flag never
// refuses a post by itself; the approval IS the human decision.
const screenTask = (t) => screen(`${t.title}\n${t.desc}\n${t.location}\n${t.poster}\n${t.contact}`).reasons;

export async function postTask(body) {
  if (!kaziOn()) throw err("The Kazi board isn't open yet.", 501);
  const fields = checkFields(body, "post");
  if ((await listIds("kzs:open", 10000)).length && (await liveOpen()).length >= maxOpen())
    throw err("The board is full for now. Try again in a few days.");
  if ((await listIds("kzs:pending", 10000)).length >= maxPending())
    throw err("Too many tasks wait for review. Try again tomorrow.");
  const token = crypto.randomBytes(24).toString("base64url");
  const task = { ...fields, id: newId(), status: "pending", flags: 0, screenReasons: screenTask(fields),
    createdAt: now(), approvedAt: null, closesAt: null, closedAt: null, closeReason: null, paidHow: null,
    manageHash: sha(token), agreedTerms: { version: KAZI_TERMS_VERSION, at: now() } };
  await setJSON(`kz:${task.id}`, task);
  await pushId("kzs:pending", task.id);
  return { id: task.id, token };
}

// Open tasks whose day has passed close by themselves, the first time the
// board is read afterwards. A closed task keeps its record; only its public
// listing ends.
async function sweep(task) {
  if (task.status === "open" && task.closesAt && Date.parse(task.closesAt) <= Date.now()) {
    task.status = "done";
    task.closedAt = now();
    task.closeReason = "expired";
    await setJSON(`kz:${task.id}`, task);
    await removeFromList("kzs:open", [task.id]);
  }
  return task;
}

async function liveOpen() {
  const tasks = await getMany("kz", await listIds("kzs:open", 10000));
  const live = [];
  for (const t of tasks) { await sweep(t); if (t.status === "open") live.push(t); }
  return live;
}

export async function pilotFull() {
  return (await liveOpen()).length >= maxOpen();
}

// The public board: open tasks only, newest first. No manage hash, no flag
// counts, no screening notes: those are Stanley's, not the visitor's.
export async function listOpen() {
  if (!kaziOn()) throw err("The Kazi board isn't open yet.", 501);
  const pub = (t) => ({ id: t.id, title: t.title, desc: t.desc, reward: t.reward, unit: t.unit,
    location: t.location, poster: t.poster, contact: t.contact, createdAt: t.createdAt, closesAt: t.closesAt });
  return (await liveOpen()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(pub);
}

async function managed(id, token) {
  if (!ID_RE.test(String(id || ""))) throw err("Unknown task.", 404);
  const task = await getJSON(`kz:${id}`);
  if (!task) throw err("Unknown task.", 404);
  const h = sha(String(token || ""));
  const a = Buffer.from(h, "hex"), b = Buffer.from(String(task.manageHash || ""), "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw err("That manage link isn't right.", 403);
  return task;
}

const mine = (t) => ({ id: t.id, title: t.title, desc: t.desc, reward: t.reward, unit: t.unit,
  location: t.location, poster: t.poster, contact: t.contact, status: t.status,
  createdAt: t.createdAt, closesAt: t.closesAt, closedAt: t.closedAt });

export async function manageTask(id, token, action, body = {}) {
  if (!kaziOn()) throw err("The Kazi board isn't open yet.", 501);
  const task = await managed(id, token);
  if (action === "get") return { task: mine(await sweep(task)) };
  if (action === "edit") {
    if (task.status !== "open" && task.status !== "pending") throw err("That task is closed.");
    Object.assign(task, checkFields({ ...task, ...body }, "edit"));
    task.screenReasons = screenTask(task);
    if (task.status === "open") { // changed words go back to review
      task.status = "pending";
      task.approvedAt = null;
      task.closesAt = null;
      await removeFromList("kzs:open", [task.id]);
      await pushId("kzs:pending", task.id);
    }
    await setJSON(`kz:${task.id}`, task);
    return { task: mine(task) };
  }
  if (action === "close") {
    if (!PAID_HOW.includes(body.paidHow)) throw err("Say how pay went: sats, kes, unpaid or unknown.");
    if (task.status !== "open" && task.status !== "pending") throw err("That task is already closed.");
    task.status = "done";
    task.closedAt = now();
    task.closeReason = "closed";
    task.paidHow = body.paidHow;
    await setJSON(`kz:${task.id}`, task);
    await removeFromList("kzs:open", [task.id]);
    await removeFromList("kzs:pending", [task.id]);
    return { task: mine(task) };
  }
  throw err("Unknown action.", 400);
}

// A flag reaches Stanley; it never hides a task by itself, so nobody can
// grief a rival's listing off the board.
export async function flagTask(id, reason) {
  if (!kaziOn()) throw err("The Kazi board isn't open yet.", 501);
  if (!ID_RE.test(String(id || ""))) throw err("Unknown task.", 404);
  const task = await getJSON(`kz:${id}`);
  if (!task || task.status === "hidden") throw err("Unknown task.", 404);
  const why = oneLine(reason, 200);
  if (!why) throw err("Say why you flag it, in a few words.");
  task.flags = (task.flags || 0) + 1;
  await setJSON(`kz:${task.id}`, task);
  if (task.flags <= 20) await pushId(`kzf:${task.id}`, `${now()} ${why}`);
  return { ok: true };
}

export async function flagReasons(id) {
  return listIds(`kzf:${id}`, 20);
}

// ---- moderation (Stanley, behind the admin gate) ---------------------------
export async function adminList() {
  const ids = (await keysWithPrefix("kz:")).map((k) => k.slice(3));
  const tasks = await getMany("kz", ids);
  for (const t of tasks) await sweep(t);
  tasks.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const out = [];
  for (const t of tasks.slice(0, 200)) out.push({ ...mine(t), flags: t.flags || 0, screenReasons: t.screenReasons || [] });
  return out;
}

export async function approveTask(id) {
  if (!ID_RE.test(String(id || ""))) throw err("Unknown task.", 404);
  const task = await getJSON(`kz:${id}`);
  if (!task) throw err("Unknown task.", 404);
  if (task.status !== "pending") throw err("Only a waiting task can be approved.");
  if ((await liveOpen()).length >= maxOpen()) throw err("The board is full.");
  task.status = "open";
  task.approvedAt = now();
  task.closesAt = new Date(Date.now() + taskDays() * 864e5).toISOString();
  await setJSON(`kz:${task.id}`, task);
  await removeFromList("kzs:pending", [task.id]);
  await pushId("kzs:open", task.id);
  return { ok: true };
}

export async function hideTask(id) {
  if (!ID_RE.test(String(id || ""))) throw err("Unknown task.", 404);
  const task = await getJSON(`kz:${id}`);
  if (!task) throw err("Unknown task.", 404);
  task.status = "hidden";
  task.closedAt = now();
  task.closeReason = "hidden";
  await setJSON(`kz:${task.id}`, task);
  await removeFromList("kzs:open", [task.id]);
  await removeFromList("kzs:pending", [task.id]);
  return { ok: true };
}
