// The apply loop, shared by the extension's background worker and the tests.
// `adapter` drives the page ({ open(url), view(), act(name, input), settle() }),
// `think(messages)` runs one AI step on the Altradits server, `human(state)`
// shows the panel and resolves with Stanley's response, `report(update)` sends
// progress to the dashboard.

const MAX_STEPS = 80;

export function describe(parts) {
  const lines = [];
  for (const p of parts) {
    lines.push(`=== FRAME ${p.frame}: ${p.title} (${p.url})`);
    if (p.notes) lines.push(`Headings/messages: ${p.notes}`);
    if (p.frames?.length) lines.push(`Embedded frames: ${p.frames.join(" ; ")}`);
    for (const e of p.elements) {
      const bits = [`[${e.id}]`, e.tag + (e.type ? `:${e.type}` : ""), JSON.stringify(e.label)];
      if (e.required) bits.push("REQUIRED");
      if (e.disabled) bits.push("disabled");
      if (e.checked !== undefined) bits.push(e.checked ? "checked" : "unchecked");
      if (e.value) bits.push(`value=${JSON.stringify(e.value)}`);
      if (e.options) bits.push(`options=${JSON.stringify(e.options)}`);
      lines.push(bits.join(" "));
    }
    if (p.frame === 0) lines.push(`Page text (start): ${p.body}`);
  }
  return lines.join("\n").slice(0, 24000);
}

export async function runApplication({ adapter, think, job, pack, applicant, files, human, report, log = () => {} }) {
  const say = async (message, extra = {}) => { await adapter.panel({ message, ...extra }); await report({ note: message }).catch(() => {}); log(message); };
  await adapter.open(job.url);
  await say(`Reading the application for ${job.title}…`);

  const brief = `JOB: ${job.title} at ${job.company}\nURL: ${job.url}

STANLEY'S APPLICANT DETAILS:
${JSON.stringify(applicant, null, 1)}

APPLICATION PACK:
Cover letter:
${pack.coverLetter}

Screening answers:
${(pack.answers || []).map((a) => `Q: ${a.q}\nA: ${a.a}`).join("\n\n") || "(none)"}

Tailored CV (uploadable as tailored_cv):
${String(pack.cv).slice(0, 6000)}

Documents available to upload: ${files.join(", ")}

CURRENT PAGE:
${await adapter.view()}`;

  const messages = [{ role: "user", content: brief }];
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await think(messages);
    if (res.stop_reason === "refusal") return { outcome: "failed", details: "The AI declined this page" };
    const calls = res.content.filter((b) => b.type === "tool_use");
    messages.push({ role: "assistant", content: res.content });
    if (!calls.length) { messages.push({ role: "user", content: "Use the tools to continue, or call finish." }); continue; }

    const results = [];
    let finished = null;
    for (const c of calls) {
      const input = c.input || {};
      let out;
      try {
        if (finished) out = "Skipped.";
        else if (c.name === "finish") { finished = input; out = "Done."; }
        else if (c.name === "ask_stanley") {
          await say(`❓ ${input.question}`);
          const r = await human({ message: `❓ ${input.question}`, status: "needs you", ask: true, wait: true });
          if (r.action === "stop") { finished = { outcome: "blocked", details: "Stopped by Stanley" }; out = "Stopped."; }
          else out = `Stanley answered: ${r.text || "(no answer)"}`;
        } else if (c.name === "wait_for_stanley") {
          await say(`✋ ${input.instruction}`);
          const r = await human({ message: `✋ ${input.instruction}\n\nPress Continue when done.`, status: "needs you", wait: true });
          if (r.action === "stop") { finished = { outcome: "blocked", details: "Stopped by Stanley" }; out = "Stopped."; }
          else out = "Stanley says it's done.";
        } else if (c.name === "ready_to_submit") {
          await report({ status: "awaiting_submit", note: `Ready to submit: ${input.summary}` }).catch(() => {});
          const r = await human({ message: `Everything is filled in. Please review the form.\n\n${input.summary}\n\nSubmit for me, or submit it yourself and press Continue.`, status: "review", wait: true, canSubmit: true });
          if (r.action === "stop") { finished = { outcome: "blocked", details: "Stanley chose not to submit" }; out = "Stanley stopped."; }
          else {
            await report({ status: "applying" }).catch(() => {});
            if (r.action === "submit") {
              await adapter.act("click", { id: input.submit_id });
              await adapter.settle(3000);
              await say("Submitted. Checking the confirmation…");
              out = "Stanley approved and the submit button was clicked. Check the page and call finish.";
            } else out = "Stanley submitted it himself. Check the page and call finish.";
          }
        } else {
          out = await adapter.act(c.name, input);
          if (c.name === "click") await adapter.settle(1500);
          await say(c.name === "click" ? `→ ${input.why}` : out);
        }
      } catch (err) {
        out = `ERROR: ${String(err.message || err).split("\n")[0].slice(0, 300)}`;
      }
      results.push({ type: "tool_result", tool_use_id: c.id, content: out, is_error: out.startsWith("ERROR") });
    }
    if (finished) return finished;
    await adapter.settle(600);
    results[results.length - 1].content += `\n\nCURRENT PAGE:\n${await adapter.view()}`;
    messages.push({ role: "user", content: results });
  }
  return { outcome: "failed", details: "Took too many steps" };
}
