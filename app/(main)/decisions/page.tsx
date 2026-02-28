"use client";

import { useState, useEffect, useCallback } from "react";
import FilterBar, { type FilterConfig } from "@/components/ui/FilterBar";
import DecisionTable, {
  type Decision,
} from "@/components/decisions/DecisionTable";
import DecisionDetailPanel from "@/components/decisions/DecisionDetailPanel";
import { DecisionItem } from "@/lib/contracts";

function apiToDecision(item: DecisionItem, idx: number): Decision {
  return {
    id: idx,
    title: item.title,
    version: item.version,
    status: item.status,
    confidence: item.confidence,
    lastUpdated: item.lastUpdated,
    explanation: item.explanation,
    timestamp: item.timestamp,
    evidence: item.evidence,
  };
}

export default function DecisionsPage() {
  const [allDecisions, setAllDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [confidenceFilter, setConfidenceFilter] = useState("All");

  const loadDecisions = useCallback(async () => {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id) return;
    const res = await fetch(`/api/decisions?chat_id=${chat_id}`);
    if (!res.ok) return;
    const items: DecisionItem[] = await res.json();
    setAllDecisions(items.map(apiToDecision));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDecisions();
    const onImport = () => loadDecisions();
    const onCleared = () => setAllDecisions([]);
    window.addEventListener("decisionops:imported", onImport);
    window.addEventListener("decisionops:cleared", onCleared);
    return () => {
      window.removeEventListener("decisionops:imported", onImport);
      window.removeEventListener("decisionops:cleared", onCleared);
    };
  }, [loadDecisions]);

  const filters: FilterConfig[] = [
    {
      type: "search",
      label: "Search Decision",
      placeholder: "Type decision title...",
      value: searchTerm,
      onChange: setSearchTerm,
    },
    {
      type: "select",
      label: "Status",
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: "All", label: "All" },
        { value: "Final", label: "Final" },
        { value: "Tentative", label: "Tentative" },
      ],
    },
    {
      type: "select",
      label: "Confidence",
      value: confidenceFilter,
      onChange: setConfidenceFilter,
      options: [
        { value: "All", label: "All" },
        { value: "High", label: "High (75%+)" },
        { value: "Medium", label: "Medium (50-74%)" },
        { value: "Low", label: "Low (<50%)" },
      ],
    },
  ];

  const filteredDecisions = allDecisions.filter((d) => {
    const matchesSearch = d.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || d.status === statusFilter;
    const matchesConfidence =
      confidenceFilter === "All" ||
      (confidenceFilter === "High" && d.confidence >= 75) ||
      (confidenceFilter === "Medium" &&
        d.confidence >= 50 &&
        d.confidence < 75) ||
      (confidenceFilter === "Low" && d.confidence < 50);
    return matchesSearch && matchesStatus && matchesConfidence;
  });

  return (
    <div className="flex gap-8">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-8 text-white border-l-4 border-[#56E1E9] pl-4">Decisions</h1>
        <FilterBar filters={filters} />
        <DecisionTable
          decisions={filteredDecisions}
          selectedId={selectedDecision?.id ?? null}
          onSelect={(d) =>
            setSelectedDecision(selectedDecision?.id === d.id ? null : d)
          }
        />
      </div>

      {selectedDecision && (
        <DecisionDetailPanel
          decision={selectedDecision}
          onClose={() => setSelectedDecision(null)}
        />
      )}
    </div>
  );
}