import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { generateDraft } from "@/lib/agents/draft";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const prospect = await db.collection("prospects").findOne({ _id: new ObjectId(id) });
  if (!prospect) return NextResponse.json({ error: "not found" }, { status: 404 });

  const run = await db.collection("runs").findOne({ _id: new ObjectId(prospect.run_id as string) });
  const icp = run ? await db.collection("icps").findOne({ _id: new ObjectId(run.icp_id as string) }) : null;
  const companyPitch = icp?.company_pitch ?? "B2B SaaS company";

  const draft = await generateDraft(prospect as never, prospect.sources ?? {}, companyPitch);
  const doc = { ...draft, prospect_id: id, created_at: new Date() };
  await db.collection("drafts").insertOne(doc);
  return NextResponse.json(doc);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const drafts = await db.collection("drafts").find({ prospect_id: id }).sort({ created_at: -1 }).toArray();
  return NextResponse.json(drafts);
}
