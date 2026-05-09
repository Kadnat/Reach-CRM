"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Draft {
  channel: string;
  subject: string;
  body: string;
  citation: string;
}

interface Prospect {
  _id: string;
  name: string;
  company: string;
  role: string;
  score?: number;
  tag?: string;
  why_this_lead?: string;
  sources?: {
    linkedin?: { bio: string; last_posts: string[] };
    twitter?: { bio: string; last_tweets: string[] };
    website?: { about: string; open_positions: string[] };
  };
}

export default function ProspectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/prospects/${id}`).then((r) => r.json()).then(setProspect);
    fetch(`/api/prospects/${id}/draft`).then((r) => r.json()).then(setDrafts);
  }, [id]);

  const generateDraft = async () => {
    setLoading(true);
    const res = await fetch(`/api/prospects/${id}/draft`, { method: "POST" });
    const data = await res.json();
    setDrafts((prev) => [data, ...prev]);
    setLoading(false);
  };

  if (!prospect) return <div className="min-h-screen bg-gray-950 text-white p-8">Loading...</div>;

  const tagColor = prospect.tag === "hot" ? "text-red-400" : prospect.tag === "warm" ? "text-orange-400" : "text-gray-400";
  const tagIcon = prospect.tag === "hot" ? "🔥" : prospect.tag === "warm" ? "🟠" : "⚪";

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm">← Back</button>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{prospect.name}</h1>
            {prospect.score != null && (
              <span className={`text-lg font-bold ${tagColor}`}>{tagIcon} {prospect.score}/100</span>
            )}
          </div>
          <p className="text-gray-300">{prospect.role} @ {prospect.company}</p>
          {prospect.why_this_lead && (
            <p className="text-sm text-blue-300 italic">{prospect.why_this_lead}</p>
          )}
        </div>

        {prospect.sources && (
          <div className="space-y-3">
            {prospect.sources.linkedin && (
              <Section title="LinkedIn">
                <p className="text-sm text-gray-300">{prospect.sources.linkedin.bio}</p>
                {prospect.sources.linkedin.last_posts?.map((p, i) => (
                  <p key={i} className="text-xs text-gray-400 border-l-2 border-gray-600 pl-2">{p}</p>
                ))}
              </Section>
            )}
            {prospect.sources.twitter && (
              <Section title="Twitter/X">
                <p className="text-sm text-gray-300">{prospect.sources.twitter.bio}</p>
                {prospect.sources.twitter.last_tweets?.map((t, i) => (
                  <p key={i} className="text-xs text-gray-400 border-l-2 border-gray-600 pl-2">{t}</p>
                ))}
              </Section>
            )}
            {prospect.sources.website && (
              <Section title="Website">
                <p className="text-sm text-gray-300">{prospect.sources.website.about}</p>
                {prospect.sources.website.open_positions?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mt-1">Open positions:</p>
                    {prospect.sources.website.open_positions.map((p, i) => (
                      <p key={i} className="text-xs text-gray-400">• {p}</p>
                    ))}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}

        <button
          onClick={generateDraft}
          disabled={loading}
          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 py-3 rounded-lg font-semibold transition"
        >
          {loading ? "Generating email..." : "Generate Outreach Email"}
        </button>

        {drafts.map((d, i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase">{d.channel}</span>
              <span className="text-xs text-blue-300">{d.citation}</span>
            </div>
            <p className="font-semibold">Subject: {d.subject}</p>
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{d.body}</pre>
          </div>
        ))}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
