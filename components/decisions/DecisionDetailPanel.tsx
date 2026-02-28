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
    <div className="w-96 bg-[#112C70] rounded-xl border border-[#5B58EB]/30 shadow-[0_8px_30px_rgba(10,35,83,0.6)] p-8 relative">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/40 hover:text-white"
      >
        ✕
      </button>

      <StatusBadge status={decision.status} />

      <h2 className="text-xl font-semibold mt-4 mb-6 text-white">
        {decision.title}
      </h2>

      <div className="border-b-2 border-[#5B58EB]/40 mb-6" />

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "details" && (
        <div className="space-y-6 text-sm">
          <p className="text-white/80 leading-relaxed">
            {decision.explanation}
          </p>
        </div>
      )}

      {activeTab === "evidence" && (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-white/80">
            Extracted from WhatsApp chat
          </p>
          {decision.evidence && decision.evidence.length > 0 ? (
            decision.evidence.map((ev, i) => (
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
              <p className="text-white/80">
                {formatTimestamp(decision.timestamp)}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "versions" && (
        <div className="text-white/80 leading-relaxed text-sm">
          <p className="text-white/80">Current Version: v{decision.version}</p>
        </div>
      )}
    </div>
  );
}
