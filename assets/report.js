// Tells the Security watch when this page's script lock blocks something that
// isn't ours (an injected script, a hijacked link). Loaded first on every page.
// Browser extensions trip the lock too; those are skipped here and on the server.
(() => {
  let sent = 0;
  document.addEventListener("securitypolicyviolation", (e) => {
    const blocked = String(e.blockedURI || "");
    if (sent >= 3 || /^(chrome|moz|safari|webkit|ms-browser)-extension:/i.test(blocked) || /-extension:/i.test(String(e.sourceFile || ""))) return;
    sent++;
    const body = JSON.stringify({ page: location.pathname, directive: e.effectiveDirective || e.violatedDirective, blocked: blocked.slice(0, 200) });
    try { navigator.sendBeacon("/api/report", new Blob([body], { type: "application/json" })); } catch { /* reporting is best effort */ }
  });
})();
