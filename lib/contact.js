// Stanley's direct number, from the OWNER_PHONE environment variable only (set
// it in DirectAdmin; never in this public repo or data/catalog.js). Without it,
// no WhatsApp or phone link is shown anywhere.
export const OWNER_PHONE = String(process.env.OWNER_PHONE || "").replace(/\D/g, "");
