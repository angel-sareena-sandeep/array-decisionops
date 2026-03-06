/**
 * DELETE /api/chat/clear
 * Body: { chat_id }
 * Clears all chat data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { isValidUUID } from "@/lib/security";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Get thread IDs
  const { data: threadRows } = await db
    .from("decision_threads")
    .select("id")
    .eq("chat_id", chat_id);

  const threadIds: string[] = (threadRows ?? []).map(
    (r: { id: string }) => r.id,
  );

  // Delete decision evidence
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
      if (error) {
        console.error(
          "[DELETE /api/chat/clear] decision_evidence:",
          error.message,
        );
        return NextResponse.json(
          { error: "Failed to clear chat data." },
          { status: 500 },
        );
      }
    }

    // Delete decisions
    const { error: decErr } = await db
      .from("decisions")
      .delete()
      .in("thread_id", threadIds);
    if (decErr) {
      console.error("[DELETE /api/chat/clear] decisions:", decErr.message);
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  // Delete decision threads
  {
    const { error } = await db
      .from("decision_threads")
      .delete()
      .eq("chat_id", chat_id);
    if (error) {
      console.error(
        "[DELETE /api/chat/clear] decision_threads:",
        error.message,
      );
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  // Delete import links
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
    if (error) {
      console.error("[DELETE /api/chat/clear] import_messages:", error.message);
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  // Delete responsibilities
  {
    const { error } = await db
      .from("responsibilities")
      .delete()
      .eq("chat_id", chat_id);
    if (error) {
      console.error(
        "[DELETE /api/chat/clear] responsibilities:",
        error.message,
      );
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  // Delete messages
  {
    const { error } = await db.from("messages").delete().eq("chat_id", chat_id);
    if (error) {
      console.error("[DELETE /api/chat/clear] messages:", error.message);
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  // Delete imports
  {
    const { error } = await db
      .from("chat_imports")
      .delete()
      .eq("chat_id", chat_id);
    if (error) {
      console.error("[DELETE /api/chat/clear] chat_imports:", error.message);
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  // Delete chat
  {
    const { error } = await db.from("chats").delete().eq("id", chat_id);
    if (error) {
      console.error("[DELETE /api/chat/clear] chats:", error.message);
      return NextResponse.json(
        { error: "Failed to clear chat data." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true });
}