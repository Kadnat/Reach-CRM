import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildIcp } from "@/lib/agents/icp";

export async function POST(req: NextRequest) {
  const { pitch, sources } = await req.json();
  if (!pitch) return NextResponse.json({ error: "pitch required" }, { status: 400 });

  const icpResult = await buildIcp(pitch);
  const db = await getDb();
  const doc = {
    ...icpResult,
    sources_enabled: sources || ["linkedin", "twitter", "website"],
    created_at: new Date(),
  };
  const result = await db.collection("icps").insertOne(doc);
  return NextResponse.json({ id: result.insertedId, ...doc });
}

export async function GET() {
  const db = await getDb();
  const icps = await db.collection("icps").find().sort({ created_at: -1 }).limit(10).toArray();
  return NextResponse.json(icps);
}
