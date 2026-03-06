/**
 * GET /api/responsibilities?chat_id=...&q=...&status=...&owner=...
 * Returns ResponsibilityItem[] exactly matching /lib/contracts.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  ResponsibilityItem,
  ResponsibilityStatus,
  EvidenceMessage,
} from "@/lib/contracts";
import { isValidUUID, sanitizeErrorMessage } from "@/lib/security";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const chat_id = params.get("chat_id");

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

  const q = params.get("q")?.toLowerCase() ?? "";
  const statusFilter = params.get("status") ?? "";
  const ownerFilter = params.get("owner")?.toLowerCase() ?? "";

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Database configuration error." },
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
    console.error("[GET /api/responsibilities] query error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch responsibilities." },
      { status: 500 },
    );
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

  const msgById: Record<
    string,
    { msg_ts: string; text: string; sender: string }
  > = {};
  if (sourceIds.length > 0) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("id, msg_ts, text, sender")
      .in("id", sourceIds);

    if (msgRows) {
      for (const m of msgRows as {
        id: string;
        msg_ts: string;
        text: string;
        sender: string;
      }[]) {
        msgById[m.id] = m;
      }
    }
  }

  // ── Map DB -> ResponsibilityItem ────────────────────────────────────────────
  let items: ResponsibilityItem[] = respRows.map((row) => {
    const srcMsg = row.source_message_id
      ? msgById[row.source_message_id]
      : null;
    const evidence: EvidenceMessage[] = srcMsg
      ? [{ text: srcMsg.text, sender: row.owner, timestamp: srcMsg.msg_ts }]
      : [];
    return {
      id: row.id,
      title: row.task_text,
      description: "",
      owner: row.owner,
      due: row.due_date ?? "",
      status: row.status as ResponsibilityStatus,
      timestamp: srcMsg ? srcMsg.msg_ts : row.created_at,
      evidenceCount: srcMsg ? 1 : 0,
      evidence,
    };
  });

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

/**
 * PATCH /api/responsibilities
 * Body: { id: string; status: "Open" | "Completed" | "Overdue" }
 * Updates the status of a single responsibility row.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json(
      { error: "Body must include 'id' and 'status'." },
      { status: 400 },
    );
  }

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid 'id' format." },
      { status: 400 },
    );
  }

  const validStatuses: ResponsibilityStatus[] = [
    "Open",
    "Completed",
    "Overdue",
  ];
  if (!validStatuses.includes(status as ResponsibilityStatus)) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}.`,
      },
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

  const { error: updateErr } = await supabase
    .from("responsibilities")
    .update({ status })
    .eq("id", id);

  if (updateErr) {
    console.error(
      "[PATCH /api/responsibilities] update error:",
      updateErr.message,
    );
    return NextResponse.json(
      { error: "Failed to update responsibility." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}