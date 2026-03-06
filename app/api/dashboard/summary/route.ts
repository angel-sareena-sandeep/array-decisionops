/**
 * GET /api/dashboard/summary?chat_id=...
 * Returns summary stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { isValidUUID } from "@/lib/security";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const chat_id = req.nextUrl.searchParams.get("chat_id");

  if (!chat_id || chat_id.trim().length === 0) {
    return NextResponse.json(
      { error: "Query param 'chat_id' is required." },
      { status: 400 },
    );
  }

  if (!isValidUUID(chat_id)) {
    return NextResponse.json(
      { error: "Invalid 'chat_id' format." },
      { status: 400 },
    );
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Database configuration error." },
      { status: 500 },
    );
  }

  // Run first query batch
  const [latestImportRes, openRespRes, threadRes] = await Promise.all([
    supabase
      .from("chat_imports")
      .select(
        "id, imported_at, messages_parsed, new_messages, duplicates_skipped",
      )
      .eq("chat_id", chat_id)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("responsibilities")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chat_id)
      .in("status", ["Open", "Overdue"]),
    supabase.from("decision_threads").select("id").eq("chat_id", chat_id),
  ]);

  const { data: latestImport, error: importErr } = latestImportRes;
  if (importErr) {
    console.error(
      "[GET /api/dashboard/summary] import query error:",
      importErr.message,
    );
    return NextResponse.json(
      { error: "Failed to fetch summary." },
      { status: 500 },
    );
  }

  const { count: openRespCount, error: respErr } = openRespRes;
  if (respErr) {
    console.error(
      "[GET /api/dashboard/summary] resp query error:",
      respErr.message,
    );
    return NextResponse.json(
      { error: "Failed to fetch summary." },
      { status: 500 },
    );
  }

  const { data: threadRows, error: threadErr } = threadRes;
  if (threadErr) {
    console.error(
      "[GET /api/dashboard/summary] thread query error:",
      threadErr.message,
    );
    return NextResponse.json(
      { error: "Failed to fetch summary." },
      { status: 500 },
    );
  }

  const last_import_at: string | null = latestImport?.imported_at ?? null;
  const messages_parsed_latest: number = latestImport?.messages_parsed ?? 0;
  const new_messages_latest: number = latestImport?.new_messages ?? 0;
  const duplicates_skipped_latest: number =
    latestImport?.duplicates_skipped ?? 0;

  // Run second query batch
  let latest_decisions_count = 0;
  let v2_plus_count = 0;
  if (threadRows && threadRows.length > 0) {
    const threadIds = threadRows.map((t: { id: string }) => t.id);
    const [decCountRes, v2CountRes] = await Promise.all([
      supabase
        .from("decisions")
        .select("id", { count: "exact", head: true })
        .in("thread_id", threadIds),
      supabase
        .from("decisions")
        .select("id", { count: "exact", head: true })
        .in("thread_id", threadIds)
        .gt("version_no", 1),
    ]);

    const { count: decCount, error: decErr } = decCountRes;
    if (decErr) {
      console.error(
        "[GET /api/dashboard/summary] decCount error:",
        decErr.message,
      );
      return NextResponse.json(
        { error: "Failed to fetch summary." },
        { status: 500 },
      );
    }
    latest_decisions_count = decCount ?? 0;

    const { count: v2Count, error: v2Err } = v2CountRes;
    if (v2Err) {
      console.error(
        "[GET /api/dashboard/summary] v2Count error:",
        v2Err.message,
      );
      return NextResponse.json(
        { error: "Failed to fetch summary." },
        { status: 500 },
      );
    }
    v2_plus_count = v2Count ?? 0;
  }

  return NextResponse.json({
    last_import_at,
    messages_parsed_latest,
    new_messages_latest,
    duplicates_skipped_latest,
    open_responsibilities_count: openRespCount ?? 0,
    latest_decisions_count,
    v2_plus_count,
  });
}