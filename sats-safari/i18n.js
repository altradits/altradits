// Sats Safari: words in English and Kiswahili. English is the fallback: a
// missing Kiswahili line shows English, and a missing key shows {key} so a
// review screenshot catches it.
const STR = { en: {} };
let lang = "en";

export const langs = () => ["en", "sw"];
export const currentLang = () => lang;

async function fetchJson(file) {
  const r = await fetch(file, { cache: "force-cache" });
  if (!r.ok) throw new Error(`missing ${file}`);
  return r.json();
}

export async function loadLang(next) {
  lang = next === "sw" ? "sw" : "en";
  if (!Object.keys(STR.en).length) STR.en = await fetchJson("/sats-safari/i18n/en.json");
  if (lang === "sw" && !Object.keys(STR.sw || {}).length) {
    try { STR.sw = await fetchJson("/sats-safari/i18n/sw.json"); }
    catch { lang = "en"; }
  }
  document.documentElement.lang = lang === "sw" ? "sw" : "en";
  return lang;
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);

export function t(path, vars) {
  let s = get(STR[lang], path);
  if (typeof s !== "string") s = get(STR.en, path);
  if (typeof s !== "string") return `{${path}}`;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

// Fill every static label: <span data-i18n="menu.play"></span>.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const v = t(el.getAttribute("data-i18n"));
    el.textContent = v;
  }
}
