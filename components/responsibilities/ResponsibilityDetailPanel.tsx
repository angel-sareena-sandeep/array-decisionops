"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import TabBar from "@/components/ui/TabBar";
import { useState } from "react";
import { type Task } from "./ResponsibilityTable";

type ResponsibilityDetailPanelProps = {
    task: Task;
    onClose: () => void;
    onMarkComplete?: () => void;
    onMarkIncomplete?: () => void;
};

const TABS = [
    { key: "details", label: "Task Details" },
    { key: "evidence", label: "Evidence" },
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

export default function ResponsibilityDetailPanel({
    task,
    onClose,
    onMarkComplete,
    onMarkIncomplete,
}: ResponsibilityDetailPanelProps) {
    const [activeTab, setActiveTab] = useState("details");

    return (
        <div className="w-96 bg-white rounded-xl border shadow-sm p-8 relative">
            <button
                onClick={onClose}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"
            >
                ✕
            </button>

            <StatusBadge status={task.status} />

            <h2 className="text-xl font-semibold mt-4 mb-6 text-gray-900">
                {task.title}
            </h2>

            {onMarkComplete && task.status !== "Completed" && (
                <button
                    onClick={onMarkComplete}
                    className="w-full mb-2 py-2 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
                >
                    ✓ Mark as Completed
                </button>
            )}
            {onMarkIncomplete && task.status === "Completed" && (
                <button
                    onClick={onMarkIncomplete}
                    className="w-full mb-2 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                >
                    ↩ Mark as Open
                </button>
            )}

            <div className="border-b mb-6" />

            <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "details" && (
                <div className="space-y-6 text-sm">
                    <div>
                        <p className="text-gray-400 text-xs uppercase mb-2">Description</p>
                        <p className="text-gray-800">{task.description}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase mb-2">Due Date</p>
                        <p className="font-medium text-gray-700">{task.due}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase mb-2">Owner</p>
                        <p className="font-medium text-gray-700">{task.owner}</p>
                    </div>
                </div>
            )}

            {activeTab === "evidence" && (
                <div className="space-y-4 text-sm text-gray-700">
                    <p className="font-medium text-gray-900">
                        Extracted from WhatsApp conversation
                    </p>
                    <div>
                        <p className="text-xs uppercase text-gray-400 mb-1">Timestamp</p>
                        <p className="text-gray-800">{formatTimestamp(task.timestamp)}</p>
                    </div>
                </div>
            )}
        </div>
    );
}