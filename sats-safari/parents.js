// Sats Safari: the parents and teachers screen. What the game teaches, how
// to play offline, and exactly what data leaves the device. Words live in
// i18n (parents.*); the stop list is reused from levels.*.
export function start(root, { t }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stops = [1, 2, 3, 4, 5, 6, 7].map((n) => `<li><b>${esc(t(`levels.${n}.name`))}.</b> ${esc(t(`levels.${n}.line`))}</li>`).join("");
  root.innerHTML =
    `<p class="lede">${esc(t("parents.intro"))}</p>` +
    `<h2>${esc(t("parents.teachT"))}</h2><ul class="points left">${stops}</ul>` +
    `<h2>${esc(t("parents.offlineT"))}</h2><p>${esc(t("parents.offline"))}</p>` +
    `<h2>${esc(t("parents.dataT"))}</h2><ul class="points left">` +
    `<li>${esc(t("parents.data1"))}</li><li>${esc(t("parents.data2"))}</li><li>${esc(t("parents.data3"))}</li></ul>` +
    `<h2>${esc(t("parents.safetyT"))}</h2><p>${esc(t("parents.safety"))}</p>`;
}
