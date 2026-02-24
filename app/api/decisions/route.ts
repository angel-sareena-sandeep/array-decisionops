/**
 * GET /api/decisions?chat_id=...&q=...&status=...&min_conf=...&max_conf=...&limit=...&offset=...
 * Returns DecisionItem[] exactly matching /lib/contracts.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { DecisionItem, DecisionStatus } from "@/lib/contracts";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const chat_id = params.get("chat_id");

  if (!chat_id || chat_id.trim().length === 0) {
    return NextResponse.json(
      { error: "Query param 'chat_id' is required." },
      { status: 400 },
    );
  }

  const q = params.get("q")?.toLowerCase() ?? "";
  const statusFilter = params.get("status") ?? "";
  const minConf = params.has("min_conf")
    ? parseInt(params.get("min_conf")!, 10)
    : 0;
  const maxConf = params.has("max_conf")
    ? parseInt(params.get("max_conf")!, 10)
    : 100;
  const limit = params.has("limit")
    ? Math.max(1, parseInt(params.get("limit")!, 10))
    : 100;
  const offset = params.has("offset")
    ? Math.max(0, parseInt(params.get("offset")!, 10))
    : 0;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Supabase config error." },
      { status: 500 },
    );
  }

  // ── Get decision_threads for this chat ──────────────────────────────────────
  const { data: threadRows, error: threadErr } = await supabase
    .from("decision_threads")
    .select("id, title")
    .eq("chat_id", chat_id);

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }
  if (!threadRows || threadRows.length === 0) {
    return NextResponse.json([] as DecisionItem[]);
  }

  const threadMap: Record<string, string> = {};
  const threadIds: string[] = [];
  for (const t of threadRows as { id: string; title: string }[]) {
    threadIds.push(t.id);
    threadMap[t.id] = t.title;
  }

  // ── Get all decisions for those threads ordered by created_at desc ──────────
  const { data: decRows, error: decErr } = await supabase
    .from("decisions")
    .select(
      "id, thread_id, version_no, status, confidence, final_outcome, created_at",
    )
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });

  if (decErr) {
    return NextResponse.json({ error: decErr.message }, { status: 500 });
  }
  if (!decRows || decRows.length === 0) {
    return NextResponse.json([] as DecisionItem[]);
  }

  // ── Keep only the most recent decision per thread ───────────────────────────
  const latestByThread: Record<string, (typeof decRows)[0]> = {};
  for (const row of decRows as Array<{
    id: string;
    thread_id: string;
    version_no: number;
    status: string;
    confidence: number;
    final_outcome: string;
    created_at: string;
  }>) {
    if (!latestByThread[row.thread_id]) {
      latestByThread[row.thread_id] = row;
    }
  }

  // ── Map DB -> DecisionItem ──────────────────────────────────────────────────
  let items: DecisionItem[] = Object.values(latestByThread).map((row) => ({
    id: row.id,
    title: threadMap[row.thread_id] ?? "",
    version: row.version_no,
    status: row.status as DecisionStatus,
    confidence: row.confidence,
    explanation: row.final_outcome ?? "",
    timestamp: row.created_at,
    lastUpdated: row.created_at,
  }));

  // ── Apply filters in code ───────────────────────────────────────────────────
  if (q) {
    items = items.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.explanation.toLowerCase().includes(q),
    );
  }
  if (statusFilter) {
    items = items.filter((d) => d.status === statusFilter);
  }
  items = items.filter(
    (d) => d.confidence >= minConf && d.confidence <= maxConf,
  );

  // Sort by timestamp desc (already ordered but re-apply after filter)
  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  // ── Pagination ──────────────────────────────────────────────────────────────
  items = items.slice(offset, offset + limit);

  return NextResponse.json(items);
}