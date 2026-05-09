"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProspectInput {
  name: string;
  company: string;
}

export default function Home() {
  const router = useRouter();
  const [pitch, setPitch] = useState("");
  const [prospects, setProspects] = useState<ProspectInput[]>([
    { name: "", company: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateProspect = (i: number, field: keyof ProspectInput, val: string) =>
    setProspects((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const addRow = () => setProspects((prev) => [...prev, { name: "", company: "" }]);
  const removeRow = (i: number) => setProspects((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!pitch.trim()) return;
    const valid = prospects.filter((p) => p.name.trim() && p.company.trim());
    if (!valid.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch, prospects: valid }),
      });
      const data = await res.json();
      if (data.run_id) router.push(`/dashboard?run_id=${data.run_id}`);
      else setError(data.error ?? "Error");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">

        {/* Header */}
        <div>
          <div className="text-xs font-mono text-neutral-500 mb-2 tracking-widest uppercase">Reach</div>
          <h1 className="text-2xl font-semibold tracking-tight">Find your next customers.</h1>
          <p className="text-sm text-neutral-500 mt-1">Describe what you do. Add a few targets. We take it from there.</p>
        </div>

        {/* Pitch */}
        <div className="space-y-2">
          <label className="text-xs text-neutral-400 uppercase tracking-wider">Your pitch</label>
          <textarea
            className="w-full h-28 bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-neutral-600 placeholder-neutral-600"
            placeholder="We build AI tools for B2B sales teams in SaaS companies with 10-200 employees..."
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
          />
        </div>

        {/* Prospects */}
        <div className="space-y-2">
          <label className="text-xs text-neutral-400 uppercase tracking-wider">Seed prospects</label>
          <div className="space-y-2">
            {prospects.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-600 placeholder-neutral-600"
                  placeholder="Full name"
                  value={p.name}
                  onChange={(e) => updateProspect(i, "name", e.target.value)}
                />
                <input
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-600 placeholder-neutral-600"
                  placeholder="Company"
                  value={p.company}
                  onChange={(e) => updateProspect(i, "company", e.target.value)}
                />
                {prospects.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-neutral-600 hover:text-neutral-400 text-lg px-1">×</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addRow} className="text-xs text-neutral-500 hover:text-neutral-300 transition mt-1">
            + Add another
          </button>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          onClick={submit}
          disabled={loading || !pitch.trim()}
          className="w-full bg-white text-black font-semibold py-3 rounded-lg text-sm hover:bg-neutral-200 disabled:opacity-30 transition"
        >
          {loading ? "Starting..." : "Enrich & Discover →"}
        </button>
      </div>
    </main>
  );
}
