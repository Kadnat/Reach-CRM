"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

interface Prospect {
  _id: string;
  name: string;
  company: string;
  role: string;
  enrichment_status: string;
  score?: number;
  tag?: "hot" | "warm" | "cold";
  why_this_lead?: string;
  sources?: Record<string, unknown>;
}

interface Run {
  _id: string;
  status: string;
  log?: { ts: string; level: string; msg: string }[];
}

const TAG_COLORS = { hot: "text-red-400", warm: "text-orange-400", cold: "text-gray-400" };
const TAG_ICON = { hot: "🔥", warm: "🟠", cold: "⚪" };

function DashboardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const icpId = params.get("icp_id");
  const runId = params.get("run_id");

  const [run, setRun] = useState<Run | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [launching, setLaunching] = useState(false);

  const pollRun = useCallback(async (rid: string) => {
    const res = await fetch(`/api/runs/${rid}`);
    const data = await res.json();
    setRun(data.run);
    setProspects(data.prospects ?? []);
    if (data.run?.status === "running" || data.run?.status === "pending") {
      setTimeout(() => pollRun(rid), 2000);
    }
  }, []);

  useEffect(() => {
    if (runId) pollRun(runId);
  }, [runId, pollRun]);

  const launchRun = async () => {
    if (!icpId) return;
    setLaunching(true);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icp_id: icpId }),
    });
    const data = await res.json();
    if (data.run_id) {
      router.push(`/dashboard?icp_id=${icpId}&run_id=${data.run_id}`);
    }
    setLaunching(false);
  };

  const statusBadge = run?.status === "done" ? "bg-green-700" :
    run?.status === "running" ? "bg-yellow-600 animate-pulse" :
    run?.status === "error" ? "bg-red-700" : "bg-gray-700";

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Reach CRM — Dashboard</h1>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">← New ICP</Link>
        </div>

        {!runId && icpId && (
          <button
            onClick={launchRun}
            disabled={launching}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-3 rounded-lg font-semibold transition"
          >
            {launching ? "Launching..." : "Launch Prospect Discovery"}
          </button>
        )}

        {run && (
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded font-mono ${statusBadge}`}>{run.status}</span>
              <span className="text-sm text-gray-300">{prospects.length} prospect(s) found</span>
            </div>
            {run.log && run.log.length > 0 && (
              <p className="text-xs text-gray-400 font-mono">{run.log[run.log.length - 1].msg}</p>
            )}
          </div>
        )}

        {prospects.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-4">Name</th>
                  <th className="text-left py-2 pr-4">Company</th>
                  <th className="text-left py-2 pr-4">Role</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2 pr-4">Score</th>
                  <th className="text-left py-2"></th>
                </tr>
              </thead>
              <tbody>
                {prospects.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((p) => (
                  <tr key={p._id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-3 pr-4 font-medium">{p.name}</td>
                    <td className="py-3 pr-4 text-gray-300">{p.company}</td>
                    <td className="py-3 pr-4 text-gray-400">{p.role}</td>
                    <td className="py-3 pr-4 text-xs font-mono text-gray-400">{p.enrichment_status}</td>
                    <td className="py-3 pr-4">
                      {p.score != null ? (
                        <span className={`font-bold ${TAG_COLORS[p.tag ?? "cold"]}`}>
                          {TAG_ICON[p.tag ?? "cold"]} {p.score}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3">
                      {p.enrichment_status === "completed" && (
                        <Link href={`/prospects/${p._id}`} className="text-blue-400 hover:underline text-xs">
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
