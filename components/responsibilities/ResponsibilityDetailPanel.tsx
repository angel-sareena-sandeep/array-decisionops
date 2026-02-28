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
    <div className="w-96 bg-[#112C70] rounded-xl border border-[#5B58EB]/30 shadow-[0_8px_30px_rgba(10,35,83,0.6)] p-8 relative">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/40 hover:text-white"
      >
        ✕
      </button>

      <StatusBadge status={task.status} />

      <h2 className="text-xl font-semibold mt-4 mb-6 text-white">
        {task.title}
      </h2>

      {onMarkComplete && task.status !== "Completed" && (
        <button
          onClick={onMarkComplete}
          className="w-full mb-2 py-2 px-4 bg-[#00C896] hover:bg-[#00C896]/80 text-[#0A2353] text-sm font-medium rounded-lg transition font-semibold"
        >
          ✓ Mark as Completed
        </button>
      )}
      {onMarkIncomplete && task.status === "Completed" && (
        <button
          onClick={onMarkIncomplete}
          className="w-full mb-2 py-2 px-4 bg-[#5B58EB]/30 hover:bg-[#5B58EB]/50 text-white text-sm font-medium rounded-lg transition"
        >
          ↩ Mark as Open
        </button>
      )}

      <div className="border-b-2 border-[#5B58EB]/40 mb-6" />

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "details" && (
        <div className="space-y-6 text-sm">
          <div>
            <p className="text-white/40 text-xs uppercase mb-2">Description</p>
            <p className="text-white/80">{task.description}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase mb-2">Due Date</p>
            <p className="font-medium text-white/80">{task.due}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase mb-2">Owner</p>
            <p className="font-medium text-white/80">{task.owner}</p>
          </div>
        </div>
      )}

      {activeTab === "evidence" && (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-white/80">
            Extracted from WhatsApp conversation
          </p>
          {task.evidence && task.evidence.length > 0 ? (
            task.evidence.map((ev, i) => (
              <div
                key={i}
                className="bg-[#0A2353]/60 border border-[#5B58EB]/30 rounded-lg p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#00C896] truncate">
                    {ev.sender}
                  </span>
                  <span className="text-xs text-white/40 shrink-0">
                    {formatTimestamp(ev.timestamp)}
                  </span>
                </div>
                <p className="text-white/80 leading-relaxed">{ev.text}</p>
              </div>
            ))
          ) : (
            <div>
              <p className="text-xs uppercase text-white/40 mb-1">Timestamp</p>
              <p className="text-white/80">{formatTimestamp(task.timestamp)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}