// Stanley's direct number. Server-only: never put it in data/catalog.js (that
// file is public). Shown to clients only after they pay for an urgent order.
export const OWNER_PHONE = (process.env.OWNER_PHONE || "254707172370").replace(/\D/g, "");
