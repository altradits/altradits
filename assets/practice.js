// Practice terminal: retype a review command to reveal its recorded output.
// Pure core below (tested in Node); the DOM mount at the bottom runs only in
// browsers. Outputs shown are the recorded ones: rehearsal, not execution.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PracticeTerminal = factory();
})(typeof self !== "undefined" ? self : this, () => {
  // A session tracks one command: how many leading characters are right and
  // how many runs it took. Solved only on an exact match.
  function createSession(target) {
    return { target: String(target), runs: 0, solved: false };
  }
  function leadingCorrect(target, typed) {
    const a = String(target), b = String(typed);
    let i = 0;
    while (i < b.length && b[i] === a[i]) i++;
    return i;
  }
  function attempt(s, typed) {
    s.runs += 1;
    s.solved = String(typed) === s.target;
    return s.solved;
  }
  function hint(s, typed) {
    const n = leadingCorrect(s.target, typed);
    return `${n} of ${s.target.length} characters right, try ${s.runs + 1}.`;
  }

  let nextId = 0;
  function mount(el, entry) {
    if (!el || typeof document === "undefined") return null;
    const session = createSession(entry.run);
    const uid = `practice-${++nextId}`;
    el.classList.add("practice");
    const label = document.createElement("div");
    label.className = "muted sm";
    label.id = `${uid}-hint`;
    label.textContent = "Practice terminal: retype the command, then run it.";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Retype the command");
    input.setAttribute("aria-describedby", `${uid}-hint`);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Run";
    button.setAttribute("aria-label", `Run: ${entry.run}`);
    const out = document.createElement("pre");
    out.hidden = true;
    const status = document.createElement("div");
    status.className = "muted sm";
    status.setAttribute("role", "status");
    const run = () => {
      if (attempt(session, input.value)) {
        out.textContent = `$ ${session.target}\n${entry.saw}\n(recorded output)`;
        out.hidden = false;
        status.textContent = `Solved in ${session.runs} ${session.runs === 1 ? "try" : "tries"}.`;
        input.disabled = true;
        button.disabled = true;
      } else {
        status.textContent = hint(session, input.value);
      }
    };
    button.addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    el.append(label, input, button, out, status);
    return session;
  }

  return { createSession, leadingCorrect, attempt, hint, mount };
});
