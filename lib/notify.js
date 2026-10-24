// WhatsApp alerts to Stanley's own number, for things that can't wait for
// email (an urgent order paid while the node is down). Uses CallMeBot's free
// personal WhatsApp API: Stanley gets his key from CallMeBot and sets
// CALLMEBOT_APIKEY in DirectAdmin. Without it, this does nothing.
// Alerts carry no client names or addresses, only what Stanley needs to act.
import { OWNER_PHONE } from "./contact.js";

export async function whatsappOwner(text) {
  const key = process.env.CALLMEBOT_APIKEY;
  if (!key || !OWNER_PHONE) return false;
  const u = new URL("https://api.callmebot.com/whatsapp.php");
  u.searchParams.set("phone", OWNER_PHONE);
  u.searchParams.set("text", String(text).slice(0, 900));
  u.searchParams.set("apikey", key);
  try { return (await fetch(u, { signal: AbortSignal.timeout(10000) })).ok; } catch { return false; }
}
