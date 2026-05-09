import { mistralJson } from "@/lib/llm/mistral";
import { ICP } from "@/lib/agents/icp";
import { EnrichedSources } from "@/lib/agents/enrich";
import { RawProspect } from "@/lib/agents/discovery";

export interface ScoreResult {
  score: number;
  breakdown: { fit: number; signal: number; reachability: number };
  why_this_lead: string;
  tag: "hot" | "warm" | "cold";
}

export async function scoreProspect(
  prospect: RawProspect,
  sources: EnrichedSources,
  icp: ICP
): Promise<ScoreResult> {
  const system = `You are a B2B sales qualification expert. Score a prospect against an ICP.
Scoring breakdown (total 100):
- Fit ICP: 0-40 (role match, industry match, company size)
- Signal: 0-40 (recent posts about the problem, hiring signals, funding)
- Reachability: 0-20 (recent activity, multi-channel presence)

Tag: hot (score>=70), warm (40-69), cold (<40)

Return ONLY valid JSON:
{
  "score": <number>,
  "breakdown": {"fit": <number>, "signal": <number>, "reachability": <number>},
  "why_this_lead": "<1-2 sentences citing a specific signal found>",
  "tag": "hot|warm|cold"
}`;

  const user = `ICP: ${JSON.stringify(icp)}
Prospect: ${JSON.stringify({ ...prospect, sources })}`;

  return mistralJson<ScoreResult>(system, user);
}
