"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface Prospect {
  _id: string;
  name: string;
  company: string;
  role?: string;
  enrichment_status: string;
  score?: number;
  tag?: "hot" | "warm" | "cold";
  sources?: {
    web?: {
      summary?: string;
      email?: string | null;
      phone?: string | null;
      company_about?: string;
      recent_mentions?: string[];
    };
  };
}

interface Run {
  status: string;
  log?: { ts: string; level: string; msg: string }[];
}

const TAG = {
  hot: { color: "text-emerald-400", dot: "bg-emerald-400" },
  warm: { color: "text-amber-400", dot: "bg-amber-400" },
  cold: { color: "text-neutral-500", dot: "bg-neutral-600" },
};

function StatusDot({ status }: { status: string }) {
  if (status === "running" || status === "pending")
    return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />;
  if (status === "completed")
    return <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-neutral-600" />;
}

function DashboardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const runId = params.get("run_id");

  const [run, setRun] = useState<Run | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const poll = useCallback(async (rid: string) => {
    const res = await fetch(`/api/runs/${rid}`);
    const data = await res.json();
    setRun(data.run);
    setProspects(data.prospects ?? []);
    if (data.run?.status === "running" || data.run?.status === "pending") {
      setTimeout(() => poll(rid), 2500);
    }
  }, []);

  useEffect(() => {
    if (runId) poll(runId);
  }, [runId, poll]);

  const lastLog = run?.log?.at(-1)?.msg ?? "";
  const isRunning = run?.status === "running" || run?.status === "pending";

  if (!runId) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <button onClick={() => router.push("/")} className="text-neutral-400 hover:text-white text-sm">← Back</button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-neutral-500 tracking-widest uppercase">Reach</div>
            <h1 className="text-xl font-semibold mt-1">Prospect pipeline</h1>
          </div>
          <button onClick={() => router.push("/")} className="text-xs text-neutral-500 hover:text-neutral-300 transition">
            ← New run
          </button>
        </div>

        {/* Status bar */}
        {run && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 flex items-center gap-3">
            <StatusDot status={run.status} />
            <span className="text-xs text-neutral-400 font-mono flex-1 truncate">{lastLog || run.status}</span>
            <span className="text-xs text-neutral-600">{prospects.length} prospect{prospects.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Prospects */}
        <div className="space-y-2">
          {prospects
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .map((p) => {
              const web = p.sources?.web;
              const tag = p.tag ?? "cold";
              const isOpen = expanded === p._id;
              return (
                <div
                  key={p._id}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden"
                >
                  {/* Row */}
                  <button
                    className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-neutral-800/50 transition"
                    onClick={() => p.enrichment_status === "completed" && setExpanded(isOpen ? null : p._id)}
                  >
                    <StatusDot status={p.enrichment_status} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{p.name}</span>
                        {p.score != null && (
                          <span className={`text-xs font-bold ${TAG[tag].color}`}>{p.score}</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">{p.company}{p.role && p.role !== "Unknown" ? ` · ${p.role}` : ""}</div>
                    </div>

                    {web?.email && (
                      <span className="text-xs text-neutral-400 font-mono hidden sm:block">{web.email}</span>
                    )}

                    {p.enrichment_status === "completed" && (
                      <span className="text-neutral-600 text-xs">{isOpen ? "▲" : "▼"}</span>
                    )}
                    {isRunning && p.enrichment_status !== "completed" && (
                      <span className="text-xs text-neutral-600 font-mono">{p.enrichment_status}</span>
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isOpen && web && (
                    <div className="border-t border-neutral-800 px-4 py-4 space-y-3 text-sm">
                      {web.summary && <p className="text-neutral-300 leading-relaxed">{web.summary}</p>}
                      {web.company_about && (
                        <p className="text-neutral-500 text-xs">{web.company_about}</p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs">
                        {web.email && (
                          <a href={`mailto:${web.email}`} className="text-blue-400 hover:underline">{web.email}</a>
                        )}
                        {web.phone && (
                          <span className="text-neutral-400">{web.phone}</span>
                        )}
                      </div>
                      {web.recent_mentions && web.recent_mentions.length > 0 && (
                        <ul className="space-y-1">
                          {web.recent_mentions.map((m, i) => (
                            <li key={i} className="text-xs text-neutral-500 flex gap-2">
                              <span className="text-neutral-700">·</span>{m}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {isRunning && prospects.length === 0 && (
            <div className="text-center py-12 text-neutral-600 text-sm">Searching...</div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}
