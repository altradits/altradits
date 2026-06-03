"use client";

import { useState } from "react";

type ParseResponse = {
  inbox_id: string;
  sender: string;
  amount: number;
  currency: string;
  tx_type: string;
  recipient: string;
  category: string;
  confidence: number;
  message: string;
  can_parse: boolean;
};

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️", transport: "🚗", family: "👨‍👩‍👧",
  investments: "🌱", bills: "💡", fun: "🎉",
  savings: "💰", health: "💊", income: "💵",
  uncategorized: "📝",
};

const CATEGORIES = [
  "food", "transport", "family", "investments",
  "bills", "fun", "savings", "health", "uncategorized",
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatKES(n: number) {
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

type Step = "paste" | "confirm" | "done";

export default function SMSPage() {
  const [step, setStep] = useState<Step>("paste");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Editable fields in confirm step
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleParse = async () => {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch(`${API}/sms/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText.trim() }),
      });
      const data: ParseResponse = await res.json();
      setParsed(data);
      setDescription(data.recipient || "");
      setAmount(String(data.amount || ""));
      setCategory(data.category || "uncategorized");
      setStep("confirm");
    } catch {
      setParseError("Could not reach the server.");
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsed || !amount) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/sms/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inbox_id: parsed.inbox_id,
          description: description || parsed.recipient,
          amount: parseFloat(amount),
          category,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSavedMessage(data.message);
        setStep("done");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    if (!parsed) return;
    await fetch(`${API}/sms/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inbox_id: parsed.inbox_id }),
    });
    handleReset();
  };

  const handleReset = () => {
    setStep("paste");
    setRawText("");
    setParsed(null);
    setParseError(null);
    setDescription("");
    setAmount("");
    setCategory("");
    setSavedMessage(null);
  };

  const confidenceColor = (c: number) => {
    if (c >= 85) return "text-emerald-600 bg-emerald-50";
    if (c >= 60) return "text-amber-600 bg-amber-50";
    return "text-stone-500 bg-stone-100";
  };

  return (
    <main className="min-h-screen bg-stone-50 p-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-stone-400 hover:text-stone-600 mb-4 inline-block">
          ← Altradits
        </a>
        <h1 className="text-xl font-semibold text-stone-800">SMS Capture</h1>
        <p className="text-sm text-stone-400 mt-1">
          Paste an M-Pesa or bank notification. We'll read it — you confirm.
        </p>
      </div>

      {/* ── STEP 1: Paste ─────────────────────────────────────── */}
      {step === "paste" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <label className="text-xs text-stone-400 font-medium block mb-2">
              Paste your SMS here
            </label>
            <textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setParseError(null); }}
              placeholder={`Example:\nKsh 2,000 sent to Jane Doe 0712345678 on 31/5/26 at 3:15 PM. New M-PESA balance is Ksh 8,432.50. Transaction cost Ksh 27.00`}
              rows={6}
              className="w-full text-sm text-stone-700 placeholder-stone-300 border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-stone-400 resize-none"
            />
            {parseError && (
              <p className="text-xs text-red-400 mt-2">{parseError}</p>
            )}
          </div>

          <button
            onClick={handleParse}
            disabled={parsing || !rawText.trim()}
            className="w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
          >
            {parsing ? "Reading..." : "Read SMS →"}
          </button>

          {/* Supported formats */}
          <div className="bg-white rounded-xl border border-stone-100 p-4">
            <p className="text-xs text-stone-400 font-medium mb-2">Supported formats</p>
            <div className="space-y-1">
              {["M-Pesa send / receive", "M-Pesa PayBill / Buy Goods", "M-Pesa withdraw / deposit", "Equity Bank alerts", "KCB Bank alerts"].map((f) => (
                <p key={f} className="text-xs text-stone-500 flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> {f}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Confirm ───────────────────────────────────── */}
      {step === "confirm" && parsed && (
        <div className="space-y-4">

          {/* Parsed result card */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                {parsed.can_parse ? "We found this" : "Could not parse"}
              </p>
              {parsed.can_parse && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${confidenceColor(parsed.confidence)}`}>
                  {parsed.confidence}% confident
                </span>
              )}
            </div>

            {parsed.can_parse ? (
              <p className="text-sm text-stone-600 leading-relaxed mb-4">
                {parsed.message}
              </p>
            ) : (
              <p className="text-sm text-stone-500 mb-4">{parsed.message}</p>
            )}

            {/* Editable fields */}
            {parsed.can_parse && (
              <div className="space-y-3 border-t border-stone-50 pt-4">
                <div>
                  <label className="text-xs text-stone-400 block mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-stone-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-400 block mb-1">Amount (KES)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-stone-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-400 block mb-1">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                          category === cat
                            ? "bg-stone-800 text-white"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                      >
                        {CATEGORY_EMOJI[cat]} {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {parsed.can_parse && (
              <button
                onClick={handleConfirm}
                disabled={saving || !amount}
                className="flex-1 py-3 bg-stone-800 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-stone-700 transition-colors"
              >
                {saving ? "Saving..." : `Save ${formatKES(parseFloat(amount) || 0)} →`}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="flex-1 py-3 bg-white border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
            >
              Dismiss
            </button>
          </div>

          <button
            onClick={handleReset}
            className="w-full py-2 text-xs text-stone-400 hover:text-stone-600"
          >
            ← Paste a different SMS
          </button>
        </div>
      )}

      {/* ── STEP 3: Done ──────────────────────────────────────── */}
      {step === "done" && (
        <div className="text-center py-12">
          <p className="text-4xl mb-4">🌱</p>
          <p className="text-lg font-semibold text-stone-800 mb-2">Saved.</p>
          <p className="text-sm text-stone-500 mb-8">{savedMessage}</p>
          <div className="space-y-3">
            <button
              onClick={handleReset}
              className="block w-full py-3 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors"
            >
              + Add another SMS
            </button>
            <a
              href="/"
              className="block w-full py-3 text-stone-500 text-sm text-center"
            >
              Back to home
            </a>
          </div>
        </div>
      )}

    </main>
  );
}