"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import ConfidenceBar from "@/components/ui/ConfidenceBar";
import { type EvidenceMessage } from "@/lib/contracts";

export type Decision = {
  id: number;
  title: string;
  version: number;
  status: string;
  confidence: number;
  lastUpdated: string;
  explanation: string;
  timestamp: string;
  evidence?: EvidenceMessage[];
};

type DecisionTableProps = {
  decisions: Decision[];
  selectedId: number | null;
  onSelect: (decision: Decision) => void;
};

export default function DecisionTable({
  decisions,
  selectedId,
  onSelect,
}: DecisionTableProps) {
  return (
    <div className="bg-[#112C70] rounded-xl border border-[#5B58EB]/30 shadow-[0_8px_30px_rgba(10,35,83,0.6)] overflow-hidden">
      <table className="w-full text-left text-white/90">
        <thead className="bg-[#5B58EB] text-white text-sm uppercase">
          <tr>
            <th className="p-4">Decision</th>
            <th className="p-4">Ver.</th>
            <th className="p-4">Status</th>
            <th className="p-4">Confidence</th>
            <th className="p-4">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {decisions.length > 0
            ? decisions.map((decision) => (
                <tr
                  key={decision.id}
                  onClick={() => onSelect(decision)}
                  className={`border-t border-[#5B58EB]/30 cursor-pointer hover:bg-[#5B58EB]/20 transition ${
                    selectedId === decision.id
                      ? "bg-[#00C896]/10 border-l-4 border-[#00C896]"
                      : ""
                  }`}
                >
                  <td className="p-4 font-medium">{decision.title}</td>
                  <td className="p-4">v{decision.version}</td>
                  <td className="p-4">
                    <StatusBadge status={decision.status} />
                  </td>
                  <td className="p-4 w-40">
                    <ConfidenceBar value={decision.confidence} />
                  </td>
                  <td className="p-4">
                    {new Date(decision.lastUpdated).toLocaleString("en-US", {
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))
            : // Render placeholder empty rows so layout stays consistent
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={`placeholder-${idx}`} className="border-t border-[#5B58EB]/30">
                  <td className="p-4 font-medium">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-8" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-20" />
                  </td>
                  <td className="p-4 w-40">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-full" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-1/2" />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}