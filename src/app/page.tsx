"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [pitch, setPitch] = useState("");
  const [sources, setSources] = useState(["linkedin", "twitter", "website"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (s: string) =>
    setSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const submit = async () => {
    if (!pitch.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch, sources }),
      });
      const data = await res.json();
      if (data.id) router.push(`/dashboard?icp_id=${data.id}`);
      else setError(data.error ?? "Error");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-6">
        <h1 className="text-3xl font-bold">Reach CRM</h1>
        <p className="text-gray-400">Describe your company. The agent builds your prospect list.</p>

        <textarea
          className="w-full h-32 bg-gray-800 rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. We make HR SaaS for industrial SMEs with 50-500 employees in France..."
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
        />

        <div>
          <p className="text-sm text-gray-400 mb-2">Sources to activate</p>
          <div className="flex gap-3">
            {["linkedin", "twitter", "website"].map((s) => (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  sources.includes(s) ? "bg-blue-600" : "bg-gray-700 text-gray-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={submit}
          disabled={loading || !pitch.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-lg font-semibold transition"
        >
          {loading ? "Building ICP..." : "Build ICP & Start"}
        </button>
      </div>
    </main>
  );
}
