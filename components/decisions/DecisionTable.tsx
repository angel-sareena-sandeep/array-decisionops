"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import ConfidenceBar from "@/components/ui/ConfidenceBar";

export type Decision = {
    id: number;
    title: string;
    version: number;
    status: string;
    confidence: number;
    lastUpdated: string;
    explanation: string;
    timestamp: string;
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
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-left text-gray-800">
                <thead className="bg-gray-100 text-gray-600 text-sm uppercase">
                    <tr>
                        <th className="p-4">Decision</th>
                        <th className="p-4">Ver.</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Confidence</th>
                        <th className="p-4">Last Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {decisions.length > 0 ? (
                        decisions.map((decision) => (
                            <tr
                                key={decision.id}
                                onClick={() => onSelect(decision)}
                                className={`border-t cursor-pointer hover:bg-gray-50 transition ${selectedId === decision.id
                                    ? "bg-blue-50 border-l-4 border-blue-500"
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
                                <td className="p-4">{decision.lastUpdated}</td>
                            </tr>
                        ))
                    ) : (
                        // Render placeholder empty rows so layout stays consistent
                        Array.from({ length: 5 }).map((_, idx) => (
                            <tr key={`placeholder-${idx}`} className="border-t">
                                <td className="p-4 font-medium">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-8" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
                                </td>
                                <td className="p-4 w-40">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
