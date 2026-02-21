/**
 * sync.ts
 *
 * Syncs a WhatsApp chat export into the Supabase database.
 * Insert order: chats -> chat_imports -> messages -> import_messages
 */

import { parseChat } from "./parser";

export type SyncResult = {
  chat_id: string;
  import_id: string;
  total_parsed: number;
  inserted_messages: number; // best-effort
  linked_import_messages: number; // best-effort
};

const CHUNK_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function syncWhatsAppImport(args: {
  supabase: unknown;
  chat_name: string;
  file_name: string;
  file_sha256: string;
  content: string;
}): Promise<SyncResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = args.supabase as any;
  const { chat_name, file_name, file_sha256, content } = args;

  // ── 1) Find or create chat ──────────────────────────────────────────────────
  const chat_key = chat_name.trim().toLowerCase();

  let { data: chatRow } = await db
    .from("chats")
    .select("id")
    .eq("chat_key", chat_key)
    .maybeSingle();

  if (!chatRow) {
    await db.from("chats").insert({ chat_key, chat_name });
    const { data } = await db
      .from("chats")
      .select("id")
      .eq("chat_key", chat_key)
      .maybeSingle();
    chatRow = data;
  }

  const chat_id: string = chatRow.id;

  // ── 2) Create chat_import ───────────────────────────────────────────────────
  const { data: importRow } = await db
    .from("chat_imports")
    .insert({ chat_id, source: "whatsapp_txt", file_name, file_sha256 })
    .select("id")
    .single();

  const import_id: string = importRow.id;

  // ── 3) Insert messages (dedupe via ON CONFLICT DO NOTHING) ──────────────────
  const parsed = parseChat(content);

  const messageRows = parsed.map((m) => ({
    chat_id,
    msg_ts: m.timestamp,
    sender: m.sender,
    text: m.message_text,
    msg_sha256: m.message_hash,
    wa_line_no: m.wa_line_no ?? null,
  }));

  let inserted_messages = 0;

  for (const chunk of chunkArray(messageRows, CHUNK_SIZE)) {
    const { count } = await db
      .from("messages")
      .insert(chunk, {
        onConflict: "chat_id,msg_sha256",
        ignoreDuplicates: true,
      })
      .select("id");
    if (typeof count === "number") inserted_messages += count;
  }

  // ── 4) Insert import_messages ───────────────────────────────────────────────
  // Query back message IDs for all hashes in this import (including pre-existing duplicates).
  const allHashes = parsed.map((m) => m.message_hash);
  let linked_import_messages = 0;

  for (const chunk of chunkArray(allHashes, CHUNK_SIZE)) {
    const { data: msgRows } = await db
      .from("messages")
      .select("id, msg_sha256")
      .eq("chat_id", chat_id)
      .in("msg_sha256", chunk);

    if (msgRows && msgRows.length > 0) {
      const linkRows = (msgRows as { id: string }[]).map((m) => ({
        import_id,
        message_id: m.id,
      }));

      await db.from("import_messages").insert(linkRows, {
        onConflict: "import_id,message_id",
        ignoreDuplicates: true,
      });

      linked_import_messages += linkRows.length; // best-effort
    }
  }

  return {
    chat_id,
    import_id,
    total_parsed: parsed.length,
    inserted_messages,
    linked_import_messages,
  };
}