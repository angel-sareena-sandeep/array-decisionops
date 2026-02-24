/**
 * GET /api/dashboard/summary?chat_id=...
 * Returns dashboard summary stats for the given chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const chat_id = req.nextUrl.searchParams.get("chat_id");

  if (!chat_id || chat_id.trim().length === 0) {
    return NextResponse.json(
      { error: "Query param 'chat_id' is required." },
      { status: 400 },
    );
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Supabase config error." },
      { status: 500 },
    );
  }

  // ── Latest import ───────────────────────────────────────────────────────────
  const { data: latestImport, error: importErr } = await supabase
    .from("chat_imports")
    .select(
      "id, imported_at, messages_parsed, new_messages, duplicates_skipped",
    )
    .eq("chat_id", chat_id)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (importErr) {
    return NextResponse.json({ error: importErr.message }, { status: 500 });
  }

  const last_import_at: string | null = latestImport?.imported_at ?? null;
  const messages_parsed_latest: number = latestImport?.messages_parsed ?? 0;
  const new_messages_latest: number = latestImport?.new_messages ?? 0;
  const duplicates_skipped_latest: number =
    latestImport?.duplicates_skipped ?? 0;

  // ── Open responsibilities count ─────────────────────────────────────────────
  const { count: openRespCount, error: respErr } = await supabase
    .from("responsibilities")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chat_id)
    .in("status", ["Open", "Overdue"]);

  if (respErr) {
    return NextResponse.json({ error: respErr.message }, { status: 500 });
  }

  // ── Latest decisions count ──────────────────────────────────────────────────
  const { data: threadRows, error: threadErr } = await supabase
    .from("decision_threads")
    .select("id")
    .eq("chat_id", chat_id);

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  let latest_decisions_count = 0;
  if (threadRows && threadRows.length > 0) {
    const threadIds = threadRows.map((t: { id: string }) => t.id);
    const { count: decCount, error: decErr } = await supabase
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds);
    if (decErr) {
      return NextResponse.json({ error: decErr.message }, { status: 500 });
    }
    latest_decisions_count = decCount ?? 0;
  }

  // ── New messages since last import ─────────────────────────────────────────
  let new_msgs_since_last_import_count = 0;
  if (last_import_at) {
    const { count: newMsgCount, error: newMsgErr } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chat_id)
      .gt("msg_ts", last_import_at);
    if (newMsgErr) {
      return NextResponse.json({ error: newMsgErr.message }, { status: 500 });
    }
    new_msgs_since_last_import_count = newMsgCount ?? 0;
  }

  return NextResponse.json({
    last_import_at,
    messages_parsed_latest,
    new_messages_latest,
    duplicates_skipped_latest,
    open_responsibilities_count: openRespCount ?? 0,
    latest_decisions_count,
    new_msgs_since_last_import_count,
  });
}