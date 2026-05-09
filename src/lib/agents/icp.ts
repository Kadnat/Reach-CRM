import { mistralJson } from "@/lib/llm/mistral";

export interface ICP {
  roles: string[];
  industries: string[];
  company_size: string;
  geography: string;
  buying_signals: string[];
}

export interface ICPResult {
  company_pitch: string;
  icp: ICP;
}

export async function buildIcp(pitch: string): Promise<ICPResult> {
  const system = `You are a B2B sales expert. Given a company description, extract a structured Ideal Customer Profile (ICP).
Return ONLY valid JSON with this exact shape:
{
  "company_pitch": "<cleaned pitch>",
  "icp": {
    "roles": ["<job title>", ...],
    "industries": ["<industry>", ...],
    "company_size": "<range e.g. 50-500>",
    "geography": "<countries or regions>",
    "buying_signals": ["<signal>", ...]
  }
}`;

  return mistralJson<ICPResult>(system, `Company description: ${pitch}`);
}
