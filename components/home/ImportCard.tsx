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

// Shared operation state

type OpStore = {
  importing: boolean;
  enriching: boolean;
  importMsg: string;
  importStatus: Status;
  enrichMsg: string;
  enrichStatus: "idle" | "loading" | "done" | "error";
};

const ops: OpStore = {
  importing: false,
  enriching: false,
  importMsg: "",
  importStatus: "idle",
  enrichMsg: "",
  enrichStatus: "idle",
};

let importDismissTimer: ReturnType<typeof setTimeout> | null = null;
let enrichDismissTimer: ReturnType<typeof setTimeout> | null = null;

function patchOps(patch: Partial<OpStore>) {
  Object.assign(ops, patch);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("decisionops:ops-changed"));
  }
}

/**
 * Hook for shared operation state.
 */
function useOps(): OpStore {
  const [, tick] = useState(0);
  useEffect(() => {
    const handler = () => tick((n) => n + 1);
    window.addEventListener("decisionops:ops-changed", handler);
    return () => window.removeEventListener("decisionops:ops-changed", handler);
  }, []);
  return ops;
}

export default function ImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasChatLoaded, setHasChatLoaded] = useState(false);
  const [clearStatus, setClearStatus] = useState<"idle" | "loading">("idle");
  const [confirmClear, setConfirmClear] = useState(false);

  const op = useOps();

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
    patchOps({ importStatus: "idle", importMsg: "" });
    e.target.value = "";
  }

  async function handleSubmit() {
    if (!selectedFile || ops.importing || ops.enriching) return;

    if (importDismissTimer) {
      clearTimeout(importDismissTimer);
      importDismissTimer = null;
    }
    patchOps({ importing: true, importStatus: "loading", importMsg: "" });

    try {
      const content = await selectedFile.text();
      const file_sha256 = await computeSha256(content);
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

      patchOps({
        importing: false,
        importStatus: "success",
        importMsg:
          `Import complete — ${json.new_messages ?? 0} new messages, ` +
          `${json.decisions_new ?? 0} new decisions (${json.decisions_detected ?? 0} detected), ` +
          `${json.responsibilities_new ?? 0} new responsibilities (${json.responsibilities_detected ?? 0} detected).`,
      });

      if (json.chat_id) {
        localStorage.setItem("decisionops_chat_id", json.chat_id);
        window.dispatchEvent(
          new CustomEvent("decisionops:imported", {
            detail: { chat_id: json.chat_id },
          }),
        );
      }
      setSelectedFile(null);

      importDismissTimer = setTimeout(() => {
        patchOps({ importMsg: "", importStatus: "idle" });
        importDismissTimer = null;
      }, 6000);
    } catch (err: unknown) {
      patchOps({
        importing: false,
        importStatus: "error",
        importMsg: err instanceof Error ? err.message : "Upload failed.",
      });
      importDismissTimer = setTimeout(() => {
        patchOps({ importMsg: "", importStatus: "idle" });
        importDismissTimer = null;
      }, 8000);
    }
  }

  async function handleClear() {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id) return;

    setClearStatus("loading");
    setConfirmClear(false);
    patchOps({ importMsg: "" });

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
      patchOps({
        importStatus: "idle",
        importMsg: "Chat data cleared successfully.",
      });
      window.dispatchEvent(new CustomEvent("decisionops:cleared"));
    } catch (err: unknown) {
      patchOps({
        importStatus: "error",
        importMsg: err instanceof Error ? err.message : "Clear failed.",
      });
    } finally {
      setClearStatus("idle");
    }
  }

  async function handleEnrich() {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id || ops.importing || ops.enriching) return;

    if (enrichDismissTimer) {
      clearTimeout(enrichDismissTimer);
      enrichDismissTimer = null;
    }
    patchOps({ enriching: true, enrichStatus: "loading", enrichMsg: "" });

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

      patchOps({
        enriching: false,
        enrichStatus: "done",
        enrichMsg: providerLabel
          ? `AI enrichment complete via ${providerLabel} (${json.candidate_messages_sent ?? "?"} messages analysed) — ${json.decisions_added ?? 0} new decisions, ${json.responsibilities_added ?? 0} new responsibilities.`
          : "LLM unavailable — no new items from AI.",
      });

      window.dispatchEvent(
        new CustomEvent("decisionops:imported", {
          detail: { chat_id },
        }),
      );

      enrichDismissTimer = setTimeout(() => {
        patchOps({ enrichMsg: "", enrichStatus: "idle" });
        enrichDismissTimer = null;
      }, 6000);
    } catch (err: unknown) {
      patchOps({
        enriching: false,
        enrichStatus: "error",
        enrichMsg: err instanceof Error ? err.message : "Enrichment failed.",
      });
      enrichDismissTimer = setTimeout(() => {
        patchOps({ enrichMsg: "", enrichStatus: "idle" });
        enrichDismissTimer = null;
      }, 8000);
    }
  }

  return (
    <div className="col-span-2 bg-[#112C70] rounded-xl border border-[#5B58EB]/30 p-8 shadow-[0_8px_30px_rgba(10,35,83,0.6)]">
      {/* File input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload area */}
      <button
        type="button"
        onClick={handleDropZoneClick}
        className="w-full border-2 border-dashed border-[#5B58EB]/60 rounded-lg p-10 text-center hover:border-[#56E1E9] transition-colors focus:outline-none focus:ring-2 focus:ring-[#56E1E9] focus:ring-offset-2 focus:ring-offset-[#112C70]"
      >
        {selectedFile ? (
          <p className="text-[#56E1E9] font-medium truncate">
            {selectedFile.name}
          </p>
        ) : (
          <>
            <p className="text-white/70 font-medium">
              Click to select a WhatsApp export (.txt)
            </p>
            <p className="text-sm text-white/30 mt-1">
              Only .txt files are accepted
            </p>
          </>
        )}
      </button>

      {/* Status text */}
      {op.importMsg && (
        <p
          className={`mt-3 text-sm font-medium ${
            op.importStatus === "success" ? "text-[#56E1E9]" : "text-red-400"
          }`}
        >
          {op.importMsg}
        </p>
      )}

      {/* Clear confirm */}
      {confirmClear && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-400/40 rounded-lg flex items-center justify-between gap-3">
          <p className="text-sm text-red-300 font-medium">
            Delete all chat data?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition font-medium"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1 bg-white/10 text-white/70 text-sm rounded hover:bg-white/20 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedFile || op.importing || op.enriching}
          className="flex-1 bg-[#5B58EB] text-white py-3 rounded-lg font-medium hover:bg-[#5B58EB]/80 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {op.importing ? "Importing…" : "Import & Sync"}
        </button>
        {hasChatLoaded && (
          <button
            type="button"
            onClick={handleEnrich}
            disabled={op.importing || op.enriching}
            className="px-4 py-3 bg-[#BB63FF]/20 text-[#BB63FF] border border-[#BB63FF]/40 rounded-lg font-medium hover:bg-[#BB63FF]/30 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {op.enriching ? "Enriching…" : "✨ Run AI Enrichment"}
          </button>
        )}
        {hasChatLoaded && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={clearStatus === "loading"}
            className="px-4 py-3 bg-red-900/20 text-red-400 border border-red-400/30 rounded-lg font-medium hover:bg-red-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {clearStatus === "loading" ? "Clearing…" : "Clear Data"}
          </button>
        )}
      </div>

      {/* Enrichment result */}
      {op.enrichMsg && (
        <p
          className={`mt-3 text-sm font-medium ${
            op.enrichStatus === "done" ? "text-[#BB63FF]" : "text-red-400"
          }`}
        >
          {op.enrichMsg}
        </p>
      )}
    </div>
  );
}