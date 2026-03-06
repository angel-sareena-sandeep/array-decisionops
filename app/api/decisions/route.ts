/**
 * GET /api/decisions?chat_id=...&q=...&status=...&min_conf=...&max_conf=...&limit=...&offset=...
 * Returns DecisionItem[] exactly matching /lib/contracts.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { DecisionItem, DecisionStatus, EvidenceMessage } from "@/lib/contracts";
import { isValidUUID, sanitizeErrorMessage } from "@/lib/security";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
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
    const minConf = params.has("min_conf")
      ? parseInt(params.get("min_conf")!, 10)
      : 0;
    const maxConf = params.has("max_conf")
      ? parseInt(params.get("max_conf")!, 10)
      : 100;
    const limit = params.has("limit")
      ? Math.min(500, Math.max(1, parseInt(params.get("limit")!, 10) || 100))
      : 100;
    const offset = params.has("offset")
      ? Math.max(0, parseInt(params.get("offset")!, 10) || 0)
      : 0;

    let supabase: ReturnType<typeof getSupabaseAdmin>;
    try {
      supabase = getSupabaseAdmin();
    } catch {
      return NextResponse.json(
        { error: "Database configuration error." },
        { status: 500 },
      );
    }

    // ── Get decision_threads for this chat ──────────────────────────────────────
    const { data: threadRows, error: threadErr } = await supabase
      .from("decision_threads")
      .select("id")
      .eq("chat_id", chat_id);

    if (threadErr) {
      console.error(
        "[GET /api/decisions] decision_threads query error:",
        threadErr.message,
      );
      return NextResponse.json(
        { error: "Failed to fetch decisions." },
        { status: 500 },
      );
    }
    if (!threadRows || threadRows.length === 0) {
      return NextResponse.json([] as DecisionItem[]);
    }

    const threadIds: string[] = (threadRows as { id: string }[]).map(
      (t) => t.id,
    );

    // ── Get all decisions for those threads ordered by created_at desc ──────────
    const { data: decRows, error: decErr } = await supabase
      .from("decisions")
      .select(
        "id, thread_id, version_no, status, confidence, decision_title, final_outcome, created_at, decided_at",
      )
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    if (decErr) {
      console.error(
        "[GET /api/decisions] decisions query error:",
        decErr.message,
      );
      return NextResponse.json(
        { error: "Failed to fetch decisions." },
        { status: 500 },
      );
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
      decision_title: string;
      final_outcome: string;
      created_at: string;
      decided_at: string | null;
    }>) {
      if (!latestByThread[row.thread_id]) {
        latestByThread[row.thread_id] = row;
      }
    }

    // ── Map DB -> DecisionItem ──────────────────────────────────────────────────
    let items: DecisionItem[] = Object.values(latestByThread).map((row) => {
      const ts =
        (row as unknown as { decided_at: string | null }).decided_at ??
        row.created_at;
      return {
        id: row.id,
        title:
          (row as unknown as { decision_title: string }).decision_title ?? "",
        version: row.version_no,
        status: row.status as DecisionStatus,
        confidence: row.confidence,
        explanation: row.final_outcome ?? "",
        timestamp: ts,
        lastUpdated: ts,
      };
    });

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

    // ── Fetch evidence messages for the returned decisions ────────────────────
    const decisionIds = items.map((d) => d.id);
    const evidenceByDecId: Record<string, EvidenceMessage[]> = {};
    if (decisionIds.length > 0) {
      // Single query using Supabase foreign key join
      const { data: evRows } = await supabase
        .from("decision_evidence")
        .select("decision_id, messages(id, text, sender, msg_ts)")
        .in("decision_id", decisionIds);

      if (evRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ev of evRows as any[]) {
          const msg = ev.messages;
          if (!msg) continue;
          if (!evidenceByDecId[ev.decision_id])
            evidenceByDecId[ev.decision_id] = [];
          evidenceByDecId[ev.decision_id].push({
            text: msg.text,
            sender: msg.sender,
            timestamp: msg.msg_ts,
          });
        }
      }
    }

    // Attach evidence sorted chronologically
    items = items.map((d) => ({
      ...d,
      evidence: (evidenceByDecId[d.id] ?? []).sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      ),
    }));

    return NextResponse.json(items);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/decisions] Unhandled error:", message);
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "Failed to fetch decisions.") },
      { status: 500 },
    );
  }
}