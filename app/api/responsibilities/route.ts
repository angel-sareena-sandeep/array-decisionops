/**
 * GET /api/responsibilities?chat_id=...&q=...&status=...&owner=...
 * Returns ResponsibilityItem[] exactly matching /lib/contracts.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { ResponsibilityItem, ResponsibilityStatus } from "@/lib/contracts";

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
  const ownerFilter = params.get("owner")?.toLowerCase() ?? "";

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Supabase config error." },
      { status: 500 },
    );
  }

  // ── Build query ─────────────────────────────────────────────────────────────
  let query = supabase
    .from("responsibilities")
    .select(
      "id, owner, task_text, status, due_date, created_at, source_message_id",
    )
    .eq("chat_id", chat_id)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json([] as ResponsibilityItem[]);
  }

  // ── Batch-fetch msg_ts for all source messages ──────────────────────────────
  type RespRow = {
    id: string;
    owner: string;
    task_text: string;
    status: string;
    due_date: string | null;
    created_at: string;
    source_message_id: string | null;
  };

  const respRows = rows as RespRow[];

  const sourceIds = respRows
    .map((r) => r.source_message_id)
    .filter((id): id is string => id !== null);

  const msgTsById: Record<string, string> = {};
  if (sourceIds.length > 0) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("id, msg_ts")
      .in("id", sourceIds);

    if (msgRows) {
      for (const m of msgRows as { id: string; msg_ts: string }[]) {
        msgTsById[m.id] = m.msg_ts;
      }
    }
  }

  // ── Map DB -> ResponsibilityItem ────────────────────────────────────────────
  let items: ResponsibilityItem[] = respRows.map((row) => ({
    id: row.id,
    title: row.task_text,
    description: "",
    owner: row.owner,
    due: row.due_date ?? "",
    status: row.status as ResponsibilityStatus,
    timestamp: row.source_message_id
      ? (msgTsById[row.source_message_id] ?? row.created_at)
      : row.created_at,
    evidenceCount: row.source_message_id ? 1 : 0,
  }));

  // ── Apply in-code filters ───────────────────────────────────────────────────
  if (q) {
    items = items.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q),
    );
  }
  if (ownerFilter) {
    items = items.filter((r) => r.owner.toLowerCase() === ownerFilter);
  }

  return NextResponse.json(items);
}