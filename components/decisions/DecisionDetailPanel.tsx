"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import TabBar from "@/components/ui/TabBar";
import { useState } from "react";
import { type Decision } from "./DecisionTable";

type DecisionDetailPanelProps = {
    decision: Decision;
    onClose: () => void;
};

const TABS = [
    { key: "details", label: "Details" },
    { key: "evidence", label: "Evidence" },
    { key: "versions", label: "Versions" },
];

function formatTimestamp(date: string) {
    return new Date(date).toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function DecisionDetailPanel({
    decision,
    onClose,
}: DecisionDetailPanelProps) {
    const [activeTab, setActiveTab] = useState("details");

    return (
        <div className="w-96 bg-white rounded-xl border shadow-sm p-8 relative">
            <button
                onClick={onClose}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"
            >
                ✕
            </button>

            <StatusBadge status={decision.status} />

            <h2 className="text-xl font-semibold mt-4 mb-6 text-gray-900">
                {decision.title}
            </h2>

            <div className="border-b mb-6" />

            <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "details" && (
                <div className="space-y-6 text-sm">
                    <p className="text-gray-800 leading-relaxed">{decision.explanation}</p>
                </div>
            )}

            {activeTab === "evidence" && (
                <div className="text-gray-800 text-sm leading-relaxed space-y-3">
                    <p className="font-medium">Extracted from WhatsApp chat</p>
                    <div>
                        <p className="text-xs uppercase text-gray-400 mb-1">Timestamp</p>
                        <p>{formatTimestamp(decision.timestamp)}</p>
                    </div>
                </div>
            )}

            {activeTab === "versions" && (
                <div className="text-gray-800 leading-relaxed text-sm">
                    <p>Current Version: v{decision.version}</p>
                </div>
            )}
        </div>
    );
}
