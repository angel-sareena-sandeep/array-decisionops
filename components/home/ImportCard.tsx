"use client";

import { useRef, useState } from "react";

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
            const chat_name = selectedFile.name.replace(/\.[^.]+$/, "");
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
                `${json.decisions_detected ?? 0} decisions, ` +
                `${json.responsibilities_detected ?? 0} responsibilities.`
            );
            setSelectedFile(null);
        } catch (err: unknown) {
            setStatus("error");
            setMessage(err instanceof Error ? err.message : "Upload failed.");
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

            {/* Submit button */}
            <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedFile || status === "loading"}
                className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {status === "loading" ? "Importing…" : "Import & Sync"}
            </button>
        </div>
    );
}
