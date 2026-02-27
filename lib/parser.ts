/**
 * parser.ts
 *
 * WhatsApp chat export parser.
 * Designed to support additional chat formats in the future.
 */

import { generateHash } from "./hash";

export type ParsedMessage = {
  sender: string; // never null; "system" for missing/empty sender
  timestamp: string; // ISO 8601 string with timezone (toISOString())
  message_text: string;
  message_hash: string; // sha256 hex
  wa_line_no?: number | null; // 1-based line number where message header starts
};

/**
 * Regex to detect the start of a new WhatsApp message line.
 *
 * Supports common WhatsApp export formats:
 *   12-hour: M/D/YY, H:MM AM - Sender: Message  (US / older iOS)
 *   24-hour: DD/MM/YYYY, HH:MM - Sender: Message (EU / Android / newer iOS)
 *   Bracket:  [DD/MM/YYYY, HH:MM:SS AM] Sender: Message  (newer iOS)
 *
 * The separator between timestamp and sender can be:
 *   - a regular ASCII hyphen-minus  "-" (U+002D)
 *   - an en-dash  "–" (U+2013)  used by many Android / newer iOS builds
 *   - an em-dash  "—" (U+2014)
 *
 * The ampm group is optional; when absent the time is treated as 24-hour.
 * Named groups: date, time, ampm (optional), sender (optional), message_text
 */
const WHATSAPP_LINE_REGEX =
  /^\[?(?<date>\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s*(?<time>\d{1,2}:\d{2})(?::?\d{2})?\s*(?<ampm>[AaPp][Mm])?\]?\s*[-\u2013\u2014]\s*(?:(?<sender>[^:]+?):\s*)?(?<message_text>.*)$/;

/**
 * Converts WhatsApp date/time parts to an ISO 8601 string (UTC, ending in Z).
 * - Auto-detects DD/MM/YY vs M/D/YY: if first part > 12 it must be the day.
 * - 2-digit year -> 2000-2099
 * - When ampm is provided: treats time as 12-hour (12:xx AM -> 0:xx, 12:xx PM -> 12:xx).
 * - When ampm is absent/empty: treats time as 24-hour (no conversion).
 * - Uses Date.UTC() so output is identical regardless of the machine's timezone.
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

  // If first part > 12 it cannot be a month → DD/MM/YY
  const month = p0 > 12 ? p1 : p0;
  const day = p0 > 12 ? p0 : p1;

  const [hourStr, minuteStr] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (ampm) {
    // 12-hour conversion
    const isPM = ampm.toLowerCase() === "pm";
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }
  // else: 24-hour — use hour as-is

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0, 0),
  ).toISOString();
}

/**
 * Normalizes sender: missing/empty -> "system"; otherwise trim + collapse whitespace.
 */
function normalizeSender(sender: string | undefined): string {
  if (!sender || sender.trim().length === 0) return "system";
  return sender.trim().replace(/\s+/g, " ");
}

/**
 * Normalizes message text for hashing:
 * - normalize line endings (\r\n -> \n, lone \r -> \n)
 * - trim overall leading/trailing whitespace
 * - remove trailing spaces/tabs at end of each line
 * - preserve internal newlines; do NOT lowercase or collapse internal spaces
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
 * Computes the deterministic sha256 hash for a parsed message.
 * Input: normalized_timestamp + "|" + normalized_sender + "|" + normalized_message_text
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
 * Parses the raw string content of a WhatsApp exported .txt file
 * into a structured array of messages.
 *
 * - Multi-line messages are joined with '\n'.
 * - System lines (no sender) have sender set to "system".
 * - Lines before the first valid message are ignored.
 * - Timestamps are emitted as ISO 8601 UTC strings.
 * - wa_line_no is the 1-based line number of the message header.
 */
export function parseChat(content: string): ParsedMessage[] {
  const results: ParsedMessage[] = [];

  // Strip a leading UTF-8 BOM (\uFEFF) that some WhatsApp exports include
  const stripped = content.startsWith("\uFEFF") ? content.slice(1) : content;

  // Holds the message currently being built (message_hash placeholder "")
  let current: ParsedMessage | null = null;

  // Finalise the in-progress message: compute hash then push
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
    // Strip a single trailing carriage return if present (Windows CRLF)
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const lineNo = i + 1; // 1-based

    const match = WHATSAPP_LINE_REGEX.exec(line);

    if (match && match.groups) {
      // New message header — commit whatever was being built
      commitCurrent();

      const { date, time, ampm, sender, message_text } = match.groups;

      current = {
        sender: normalizeSender(sender),
        timestamp: parseTimestampToISO(date, time, ampm),
        message_text: message_text ?? "",
        message_hash: "", // replaced in commitCurrent
        wa_line_no: lineNo,
      };
    } else {
      // Continuation line — append to the current message
      if (current !== null) {
        const prev: ParsedMessage = current;
        current = {
          ...prev,
          message_text: prev.message_text + "\n" + line,
        };
      }
      // Lines before the first valid message are silently ignored
    }
  }

  // Commit the final message after all lines are processed
  commitCurrent();

  return results;
}