"use client";

import { useEffect, useState, useCallback } from "react";
import StatCard from "@/components/ui/StatCard";
import TopStatusBar from "@/components/layout/TopStatusBar";
import ImportCard from "@/components/home/ImportCard";
import RecentDecisionsTable from "@/components/home/RecentDecisionsTable";
import { DecisionItem } from "@/lib/contracts";

type Summary = {
  last_import_at: string | null;
  messages_parsed_latest: number;
  new_messages_latest: number;
  duplicates_skipped_latest: number;
  open_responsibilities_count: number;
  latest_decisions_count: number;
  new_msgs_since_last_import_count: number;
};

function fmt(n: number | null | undefined): string {
  return n == null ? "-" : String(n);
}

export default function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<
    Parameters<typeof RecentDecisionsTable>[0]["decisions"]
  >([]);

  const loadData = useCallback(async () => {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id) return;

    const [summaryRes, decisionsRes] = await Promise.all([
      fetch(`/api/dashboard/summary?chat_id=${chat_id}`),
      fetch(`/api/decisions?chat_id=${chat_id}&limit=10`),
    ]);

    if (summaryRes.ok) {
      const data: Summary = await summaryRes.json();
      setSummary(data);
    }

    if (decisionsRes.ok) {
      const items: DecisionItem[] = await decisionsRes.json();
      setRecentDecisions(
        items.map((item, idx) => ({
          id: idx,
          title: item.title,
          status: item.status,
          confidence: `${item.confidence}%`,
          lastUpdated: new Date(item.lastUpdated).toLocaleDateString(),
          evidenceCount: 0,
        })),
      );
    }
  }, []);

  useEffect(() => {
    loadData();
    const onImport = () => loadData();
    const onCleared = () => {
      setSummary(null);
      setRecentDecisions([]);
    };
    window.addEventListener("decisionops:imported", onImport);
    window.addEventListener("decisionops:cleared", onCleared);
    return () => {
      window.removeEventListener("decisionops:imported", onImport);
      window.removeEventListener("decisionops:cleared", onCleared);
    };
  }, [loadData]);

  const metrics = [
    { title: "Messages Parsed", value: fmt(summary?.messages_parsed_latest) },
    { title: "New Messages", value: fmt(summary?.new_messages_latest) },
    {
      title: "Duplicates Skipped",
      value: fmt(summary?.duplicates_skipped_latest),
    },
    {
      title: "Decisions Detected",
      value: fmt(summary?.latest_decisions_count),
      highlight: true,
    },
  ];

  const summaryCards = [
    {
      title: "Latest Valid Decisions",
      value: fmt(summary?.latest_decisions_count),
    },
    { title: "Decisions Updated (v2+)", value: "-" },
    {
      title: "Open Responsibilities",
      value: fmt(summary?.open_responsibilities_count),
    },
    {
      title: "New Msgs Since Import",
      value: fmt(summary?.new_msgs_since_last_import_count),
    },
  ];

  return (
    <div className="space-y-10">
      <TopStatusBar
        lastImport={
          summary?.last_import_at
            ? new Date(summary.last_import_at).toLocaleString()
            : undefined
        }
        duplicatesSkipped={summary?.duplicates_skipped_latest}
      />

      <div className="grid grid-cols-3 gap-6">
        <ImportCard />
        <div className="grid grid-cols-2 gap-6">
          {metrics.map((item, index) => (
            <StatCard
              key={index}
              title={item.title}
              value={item.value}
              highlight={item.highlight}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {summaryCards.map((item, index) => (
          <StatCard key={index} title={item.title} value={item.value} />
        ))}
      </div>

      <RecentDecisionsTable decisions={recentDecisions} />
    </div>
  );
}