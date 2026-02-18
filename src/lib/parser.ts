/**
 * parser.ts
 *
 * WhatsApp chat export parser.
 * Designed to support additional chat formats in the future.
 */

export type ParsedMessage = {
  sender: string | null;
  timestamp: string;
  message_text: string;
};

/**
 * Regex to detect the start of a new WhatsApp message line.
 *
 * Matches format: M/D/YY, H:MM am - Sender: Message
 * Named groups: date, time, ampm, sender (optional), message_text
 */
const WHATSAPP_LINE_REGEX =
  /^(?<date>\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s+(?<time>\d{1,2}:\d{2})\s*(?<ampm>[AaPp][Mm])\s*-\s*(?:(?<sender>[^:]+?):\s*)?(?<message_text>.*)$/;

/**
 * Parses the raw string content of a WhatsApp exported .txt file
 * into a structured array of messages.
 *
 * - Multi-line messages are joined with '\n'.
 * - System messages (no sender) have sender set to null.
 * - Lines before the first valid message are ignored.
 * - The timestamp is preserved exactly as it appears in the file.
 */
export function parseChat(content: string): ParsedMessage[] {
  const results: ParsedMessage[] = [];

  // Holds the message currently being built
  let current: ParsedMessage | null = null;

  // Commit the in-progress message to results
  const commitCurrent = (): void => {
    if (current !== null) {
      results.push(current);
      current = null;
    }
  };

  // Split on any line ending; remove only trailing \r or \n per line
  const lines = content.split(/\n/);

  for (const rawLine of lines) {
    // Strip a single trailing carriage return if present (Windows CRLF)
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    const match = WHATSAPP_LINE_REGEX.exec(line);

    if (match && match.groups) {
      // This line starts a new message — commit whatever was being built
      commitCurrent();

      const { date, time, ampm, sender, message_text } = match.groups;

      // Reconstruct the timestamp exactly as it appeared in the file
      const timestamp = `${date}, ${time} ${ampm}`;

      current = {
        sender:
          sender !== undefined && sender.trim().length > 0
            ? sender.trim()
            : null,
        timestamp,
        message_text: message_text ?? "",
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
