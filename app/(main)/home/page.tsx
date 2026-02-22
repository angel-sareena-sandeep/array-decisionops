"use client";

import StatCard from "@/components/ui/StatCard";
import TopStatusBar from "@/components/layout/TopStatusBar";
import ImportCard from "@/components/home/ImportCard";
import RecentDecisionsTable from "@/components/home/RecentDecisionsTable";

// TODO: replace with API call to fetch metrics
const metrics = [
  { title: "Messages Parsed", value: "-" },
  { title: "New Messages", value: "-" },
  { title: "Duplicates Skipped", value: "-" },
  { title: "Decisions Detected", value: "-", highlight: true },
];

// TODO: replace with API call to fetch summary stats
const summaryCards = [
  { title: "Latest Valid Decisions", value: "-" },
  { title: "Decisions Updated (v2+)", value: "-" },
  { title: "Open Responsibilities", value: "-" },
  { title: "New Msgs Since Import", value: "-" },
];

// TODO: replace with API call to fetch recent decisions
const recentDecisions: Parameters<typeof RecentDecisionsTable>[0]["decisions"] = [];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <TopStatusBar />

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