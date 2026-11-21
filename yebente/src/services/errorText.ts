// Error messages that say what actually happened.
//
// The server words its own refusals ("Wrong PIN", "Not enough sats") and those
// are shown as they are. This file covers everything else: no answer at all
// (offline, a dropped connection, a timeout), or an answer with no words in it
// (a gateway's HTML page, an empty body). The browser's own text for those
// ("Failed to fetch", "Unexpected token <") means nothing to the person holding
// the phone. For anything that moves money, an unclear result says so, so
// nobody pays twice by retrying blind.

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// No words from the server: explain the HTTP status (0 = no answer at all).
export function httpTrouble(status: number, writing: boolean, offline = isOffline()): string {
  const check = writing ? ' Check your balance and history before trying again: it may have gone through.' : '';
  if (status === 0) return offline
    ? 'Your phone is offline. Connect to the internet and try again.'
    : "Couldn't reach Ye₿ente. Check your connection and try again." + check;
  if (status === 401) return 'Your session ended. Unlock the wallet with your PIN and try again.';
  if (status === 403) return 'Ye₿ente refused this request from this network or browser. Try again on mobile data or another browser.';
  if (status === 404) return 'Ye₿ente did not recognise this request. Refresh the page to get the latest version of the app.';
  if (status === 413) return 'That request is too large. Try something shorter.';
  if (status === 429) return 'Too many tries in a short time. Wait a minute and try again.';
  if (status === 502 || status === 503) return 'Ye₿ente is restarting or busy. Try again in a minute.' + check;
  if (status === 504) return 'Ye₿ente took too long to answer.' + check;
  if (status >= 500) return `Ye₿ente hit a problem on its side (error ${status}).` + check;
  return `Ye₿ente gave an unexpected answer (error ${status}). Refresh and try again.`;
}

// The server's own words if it gave any, else what the status means.
export function serverError(status: number, data: unknown, writing: boolean): string {
  const said = (data as { error?: unknown } | null)?.error;
  if (typeof said === 'string' && said.trim()) return said;
  return httpTrouble(status >= 200 && status < 300 ? 500 : status, writing);
}

// A caught error, in words people can act on. Messages written by Ye₿ente
// (the server's, or the app's own) pass through; the browser's raw network,
// timeout and parsing errors are translated.
export function readableError(err: unknown, fallback: string, writing = false): string {
  if (!(err instanceof Error) && !(typeof DOMException !== 'undefined' && err instanceof DOMException)) return fallback;
  const e = err as Error;
  const msg = String(e.message || '');
  if (e.name === 'AbortError' || e.name === 'TimeoutError' || /timed? ?out|signal is aborted/i.test(msg)) {
    return isOffline() ? httpTrouble(0, writing) : httpTrouble(504, writing);
  }
  if (e.name === 'TypeError' && /fetch|network|load failed|internet connection/i.test(msg)) return httpTrouble(0, writing);
  if (e.name === 'SyntaxError' || /JSON|Unexpected token|unexpected character/i.test(msg)) return httpTrouble(502, writing);
  return msg.trim() || fallback;
}
