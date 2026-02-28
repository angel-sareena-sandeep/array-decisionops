"use client";

import { useRef, useState, useEffect } from "react";

type Status = "idle" | "loading" | "success" | "error";

async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [hasChatLoaded, setHasChatLoaded] = useState(false);
  const [clearStatus, setClearStatus] = useState<"idle" | "loading">("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [enrichMessage, setEnrichMessage] = useState<string>("");

  useEffect(() => {
    setHasChatLoaded(!!localStorage.getItem("decisionops_chat_id"));
    const handler = () =>
      setHasChatLoaded(!!localStorage.getItem("decisionops_chat_id"));
    window.addEventListener("decisionops:imported", handler);
    window.addEventListener("decisionops:cleared", handler);
    return () => {
      window.removeEventListener("decisionops:imported", handler);
      window.removeEventListener("decisionops:cleared", handler);
    };
  }, []);

  function handleDropZoneClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setStatus("idle");
    setMessage("");
    // Reset input so the same file can be re-selected after a clear
    e.target.value = "";
  }

  async function handleSubmit() {
    if (!selectedFile) return;

    setStatus("loading");
    setMessage("");

    try {
      const content = await selectedFile.text();
      const file_sha256 = await computeSha256(content);
      // Strip extension, then strip WhatsApp re-export suffixes like " (1)", "(2)", "_2"
      // so that "WhatsApp Chat(1).txt" maps to the same chat as "WhatsApp Chat.txt".
      const baseName = selectedFile.name.replace(/\.[^.]+$/, "");
      const chat_name = baseName
        .replace(/\s*\(\d+\)$/, "")
        .replace(/[-_]\d+$/, "")
        .trim();
      const file_name = selectedFile.name;

      const res = await fetch("/api/import/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_name, file_name, file_sha256, content }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }

      setStatus("success");
      setMessage(
        `Import complete — ${json.new_messages ?? 0} new messages, ` +
          `${json.decisions_new ?? 0} new decisions (${json.decisions_detected ?? 0} detected), ` +
          `${json.responsibilities_new ?? 0} new responsibilities (${json.responsibilities_detected ?? 0} detected).`,
      );
      // Persist chat_id so all pages can query the correct dataset
      if (json.chat_id) {
        localStorage.setItem("decisionops_chat_id", json.chat_id);
        window.dispatchEvent(
          new CustomEvent("decisionops:imported", {
            detail: { chat_id: json.chat_id },
          }),
        );
      }
      setSelectedFile(null);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function handleClear() {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id) return;

    setClearStatus("loading");
    setConfirmClear(false);
    setMessage("");

    try {
      const res = await fetch("/api/chat/clear", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error ?? `Request failed (${res.status})`);

      localStorage.removeItem("decisionops_chat_id");
      setHasChatLoaded(false);
      setStatus("idle");
      setMessage("Chat data cleared successfully.");
      window.dispatchEvent(new CustomEvent("decisionops:cleared"));
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setClearStatus("idle");
    }
  }

  async function handleEnrich() {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id) return;

    setEnrichStatus("loading");
    setEnrichMessage("");

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error ?? `Request failed (${res.status})`);

      const providerLabel =
        json.llm_used === "openrouter"
          ? "OpenRouter"
          : json.llm_used === "groq"
            ? "Groq"
            : null;
      setEnrichStatus("done");
      setEnrichMessage(
        providerLabel
          ? `AI enrichment complete via ${providerLabel} (${json.candidate_messages_sent ?? "?"} messages analysed) — ${json.decisions_added ?? 0} new decisions, ${json.responsibilities_added ?? 0} new responsibilities.`
          : "LLM unavailable — no new items from AI.",
      );
    } catch (err: unknown) {
      setEnrichStatus("error");
      setEnrichMessage(
        err instanceof Error ? err.message : "Enrichment failed.",
      );
    }
  }

  return (
    <div className="col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Drop zone / click area */}
      <button
        type="button"
        onClick={handleDropZoneClick}
        className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-10 text-center hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {selectedFile ? (
          <p className="text-blue-600 dark:text-blue-400 font-medium truncate">
            {selectedFile.name}
          </p>
        ) : (
          <>
            <p className="text-gray-600 dark:text-gray-300 font-medium">
              Click to select a WhatsApp export (.txt)
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Only .txt files are accepted
            </p>
          </>
        )}
      </button>

      {/* Status message */}
      {message && (
        <p
          className={`mt-3 text-sm font-medium ${
            status === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {message}
        </p>
      )}

      {/* Clear confirmation prompt */}
      {confirmClear && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 font-medium">
            Delete all chat data?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Submit + AI Enrichment + Clear buttons */}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedFile || status === "loading"}
          className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Importing…" : "Import & Sync"}
        </button>
        {hasChatLoaded && (
          <button
            type="button"
            onClick={handleEnrich}
            disabled={enrichStatus === "loading"}
            className="px-4 py-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg font-medium hover:bg-purple-100 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700"
          >
            {enrichStatus === "loading" ? "Enriching…" : "✨ Run AI Enrichment"}
          </button>
        )}
        {hasChatLoaded && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={clearStatus === "loading"}
            className="px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {clearStatus === "loading" ? "Clearing…" : "Clear Data"}
          </button>
        )}
      </div>

      {/* AI enrichment result */}
      {enrichMessage && (
        <p
          className={`mt-3 text-sm font-medium ${
            enrichStatus === "done"
              ? "text-purple-600 dark:text-purple-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {enrichMessage}
        </p>
      )}
    </div>
  );
}