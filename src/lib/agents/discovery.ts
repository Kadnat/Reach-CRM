import { runCuaTask } from "@/lib/cua/tzafon";
import { ICP } from "@/lib/agents/icp";

export interface RawProspect {
  name: string;
  company: string;
  role: string;
  linkedin_url?: string;
  twitter_url?: string;
  website_url?: string;
}

export async function discoverProspects(icp: ICP, companyPitch: string): Promise<RawProspect[]> {
  const instruction = `You are a B2B sales researcher. Search Google and LinkedIn to find 5 real people who match this Ideal Customer Profile:

Company context: ${companyPitch}
Target roles: ${icp.roles.join(", ")}
Industries: ${icp.industries.join(", ")}
Company size: ${icp.company_size}
Geography: ${icp.geography}

Steps:
1. Go to google.com
2. Search for: site:linkedin.com/in "${icp.roles[0]}" "${icp.industries[0]}"
3. Find 5 real profiles with name, company, role, and LinkedIn URL
4. Return a JSON array like:
[
  {"name": "...", "company": "...", "role": "...", "linkedin_url": "https://linkedin.com/in/..."},
  ...
]

IMPORTANT: Return ONLY the JSON array, nothing else.`;

  const raw = await runCuaTask(instruction);

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as RawProspect[];
  } catch {
    return [];
  }
}
