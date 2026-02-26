/**
 * DELETE /api/chat/clear
 * Body JSON: { chat_id }
 *
 * Deletes all data for the given chat in reverse FK dependency order:
 *   decision_evidence → decisions → decision_threads
 *   import_messages → responsibilities → messages → chat_imports → chats
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { chat_id } = (body as Record<string, unknown>) ?? {};

  if (typeof chat_id !== "string" || chat_id.trim().length === 0) {
    return NextResponse.json(
      { error: "Required field: chat_id." },
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── 1) Resolve thread IDs for this chat ─────────────────────────────────────
  const { data: threadRows } = await db
    .from("decision_threads")
    .select("id")
    .eq("chat_id", chat_id);

  const threadIds: string[] = (threadRows ?? []).map(
    (r: { id: string }) => r.id,
  );

  // ── 2) Delete decision_evidence via decisions in those threads ───────────────
  if (threadIds.length > 0) {
    const { data: decRows } = await db
      .from("decisions")
      .select("id")
      .in("thread_id", threadIds);

    const decIds: string[] = (decRows ?? []).map((r: { id: string }) => r.id);

    if (decIds.length > 0) {
      const { error } = await db
        .from("decision_evidence")
        .delete()
        .in("decision_id", decIds);
      if (error)
        return NextResponse.json(
          { error: `decision_evidence: ${error.message}` },
          { status: 500 },
        );
    }

    // ── 3) Delete decisions ────────────────────────────────────────────────────
    const { error: decErr } = await db
      .from("decisions")
      .delete()
      .in("thread_id", threadIds);
    if (decErr)
      return NextResponse.json(
        { error: `decisions: ${decErr.message}` },
        { status: 500 },
      );
  }

  // ── 4) Delete decision_threads ───────────────────────────────────────────────
  {
    const { error } = await db
      .from("decision_threads")
      .delete()
      .eq("chat_id", chat_id);
    if (error)
      return NextResponse.json(
        { error: `decision_threads: ${error.message}` },
        { status: 500 },
      );
  }

  // ── 5) Delete import_messages via chat_imports ───────────────────────────────
  const { data: importRows } = await db
    .from("chat_imports")
    .select("id")
    .eq("chat_id", chat_id);

  const importIds: string[] = (importRows ?? []).map(
    (r: { id: string }) => r.id,
  );

  if (importIds.length > 0) {
    const { error } = await db
      .from("import_messages")
      .delete()
      .in("import_id", importIds);
    if (error)
      return NextResponse.json(
        { error: `import_messages: ${error.message}` },
        { status: 500 },
      );
  }

  // ── 6) Delete responsibilities ───────────────────────────────────────────────
  {
    const { error } = await db
      .from("responsibilities")
      .delete()
      .eq("chat_id", chat_id);
    if (error)
      return NextResponse.json(
        { error: `responsibilities: ${error.message}` },
        { status: 500 },
      );
  }

  // ── 7) Delete messages ───────────────────────────────────────────────────────
  {
    const { error } = await db.from("messages").delete().eq("chat_id", chat_id);
    if (error)
      return NextResponse.json(
        { error: `messages: ${error.message}` },
        { status: 500 },
      );
  }

  // ── 8) Delete chat_imports ───────────────────────────────────────────────────
  {
    const { error } = await db
      .from("chat_imports")
      .delete()
      .eq("chat_id", chat_id);
    if (error)
      return NextResponse.json(
        { error: `chat_imports: ${error.message}` },
        { status: 500 },
      );
  }

  // ── 9) Delete chat ───────────────────────────────────────────────────────────
  {
    const { error } = await db.from("chats").delete().eq("id", chat_id);
    if (error)
      return NextResponse.json(
        { error: `chats: ${error.message}` },
        { status: 500 },
      );
  }

  return NextResponse.json({ success: true });
}