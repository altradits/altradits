// Runs on the Altradits dashboard. Tells the dashboard the extension is
// installed, and passes "Apply with AI" clicks (plus the dashboard sign-in
// already in this tab) to the extension.
document.documentElement.dataset.altraditsApply = chrome.runtime.getManifest().version;
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== "altradits-dashboard") return;
  if (e.data.type === "apply") {
    const token = sessionStorage.getItem("altra.admin");
    chrome.runtime.sendMessage({ type: "apply", id: e.data.id, token, site: location.origin }, (r) => {
      window.postMessage({ source: "altradits-apply", type: "apply-ack", id: e.data.id, ok: Boolean(r?.ok), error: r?.error || chrome.runtime.lastError?.message || "" }, location.origin);
    });
  }
});
