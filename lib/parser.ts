/**
 * WhatsApp chat parser.
 */

import { generateHash } from "./hash";

export type ParsedMessage = {
  sender: string; // "system" if missing
  timestamp: string; // ISO 8601
  message_text: string;
  message_hash: string; // sha256 hex
  wa_line_no?: number | null; // 1-based header line
};

/**
 * Regex for WhatsApp message headers.
 */
const WHATSAPP_LINE_REGEX =
  /^\[?(?<date>\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s*(?<time>\d{1,2}:\d{2})(?::?\d{2})?\s*(?<ampm>[AaPp][Mm])?\]?\s*[-\u2013\u2014]\s*(?:(?<sender>[^:]+?):\s*)?(?<message_text>.*)$/;

/**
 * Convert date/time parts to ISO UTC.
 */
function parseTimestampToISO(
  date: string,
  time: string,
  ampm: string | undefined,
): string {
  const dateParts = date.split(/[\/.\-]/);
  const p0 = parseInt(dateParts[0], 10);
  const p1 = parseInt(dateParts[1], 10);
  let year = parseInt(dateParts[2], 10);
  if (year < 100) year += 2000;

  // If first part > 12, use day-first
  const month = p0 > 12 ? p1 : p0;
  const day = p0 > 12 ? p0 : p1;

  const [hourStr, minuteStr] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (ampm) {
    // Convert 12-hour time
    const isPM = ampm.toLowerCase() === "pm";
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }
  // 24-hour time uses hour as-is

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0, 0),
  ).toISOString();
}

/**
 * Normalize sender name.
 */
function normalizeSender(sender: string | undefined): string {
  if (!sender || sender.trim().length === 0) return "system";
  return sender.trim().replace(/\s+/g, " ");
}

/**
 * Normalize message text for hashing.
 */
function normalizeMessageText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
}

/**
 * Compute deterministic message hash.
 */
function computeMessageHash(
  timestamp: string,
  sender: string,
  message_text: string,
): string {
  const nt = timestamp.trim().replace(/\s+/g, " ");
  const ns = sender.trim().replace(/\s+/g, " ");
  const nm = normalizeMessageText(message_text);
  return generateHash(`${nt}|${ns}|${nm}`);
}

/**
 * Parse WhatsApp export text into messages.
 */
export function parseChat(content: string): ParsedMessage[] {
  const results: ParsedMessage[] = [];

  // Remove optional UTF-8 BOM
  const stripped = content.startsWith("\uFEFF") ? content.slice(1) : content;

  // Message being built
  let current: ParsedMessage | null = null;

  // Finalize current message
  const commitCurrent = (): void => {
    if (current !== null) {
      const message_hash = computeMessageHash(
        current.timestamp,
        current.sender,
        current.message_text,
      );
      results.push({ ...current, message_hash });
      current = null;
    }
  };

  const lines = stripped.split(/\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Remove trailing CR in CRLF files
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const lineNo = i + 1; // 1-based

    const match = WHATSAPP_LINE_REGEX.exec(line);

    if (match && match.groups) {
      // New header: commit previous message
      commitCurrent();

      const { date, time, ampm, sender, message_text } = match.groups;

      current = {
        sender: normalizeSender(sender),
        timestamp: parseTimestampToISO(date, time, ampm),
        message_text: message_text ?? "",
        message_hash: "", // set in commitCurrent
        wa_line_no: lineNo,
      };
    } else {
      // Continuation line
      if (current !== null) {
        const prev: ParsedMessage = current;
        current = {
          ...prev,
          message_text: prev.message_text + "\n" + line,
        };
      }
      // Ignore lines before first message
    }
  }

  // Commit last message
  commitCurrent();

  return results;
}