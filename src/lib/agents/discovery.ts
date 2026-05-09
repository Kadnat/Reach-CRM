import { createSession, deleteSession, runCuaOnKernel } from "@/lib/cua/kernel";
import { ICP } from "@/lib/agents/icp";

export interface RawProspect {
  name: string;
  company: string;
  role: string;
  linkedin_url?: string;
  twitter_url?: string;
  website_url?: string;
}

export async function discoverProspects(
  icp: ICP,
  companyPitch: string,
  onProgress?: (msg: string) => void
): Promise<RawProspect[]> {
  void companyPitch;
  const session = await createSession();
  onProgress?.(`KERNEL session created: ${session.sessionId}`);

  try {
    const task = `Go to google.com and search for: "${icp.roles[0]}" "${icp.industries[0]}" site:linkedin.com/in

From the Google search results page (do NOT navigate into any profile), collect the first 5 results that look like real LinkedIn profiles.
For each result extract from the search snippet: full name, company name, job title, and LinkedIn URL.

Return ONLY this JSON array, nothing else:
[
  {"name": "...", "company": "...", "role": "...", "linkedin_url": "https://linkedin.com/in/..."},
  {"name": "...", "company": "...", "role": "...", "linkedin_url": "https://linkedin.com/in/..."}
]`;

    const raw = await runCuaOnKernel(session.sessionId, task, onProgress);

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as RawProspect[];
  } catch (err) {
    onProgress?.(`Discovery error: ${String(err)}`);
    return [];
  } finally {
    await deleteSession(session.sessionId).catch(() => null);
  }
}
