"use client";

import { useState } from "react";
import StatCard from "@/components/ui/StatCard";
import FilterBar, { type FilterConfig } from "@/components/ui/FilterBar";
import ResponsibilityTable, { type Task } from "@/components/responsibilities/ResponsibilityTable";
import ResponsibilityDetailPanel from "@/components/responsibilities/ResponsibilityDetailPanel";

// TODO: replace with API call to fetch tasks
const TASKS: Task[] = [];

// TODO: replace with API call to fetch summary stats
const STAT_CARDS = [
  { title: "Open Responsibilities", value: "-" },
  { title: "Completed", value: "-" },
  { title: "Overdue", value: "-" },
  { title: "Added Since Last Import", value: "-" },
];

export default function ResponsibilitiesPage() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");

  const filters: FilterConfig[] = [
    {
      type: "search",
      label: "Search Task",
      placeholder: "Type task name...",
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
        { value: "Open", label: "Open" },
        { value: "Completed", label: "Completed" },
        { value: "Overdue", label: "Overdue" },
      ],
    },
    {
      type: "select",
      label: "Owner",
      value: ownerFilter,
      onChange: setOwnerFilter,
      options: [
        { value: "All", label: "All" },
        // TODO: populate dynamically from API
      ],
    },
  ];

  const filteredTasks = TASKS.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || task.status === statusFilter;
    const matchesOwner = ownerFilter === "All" || task.owner === ownerFilter;
    return matchesSearch && matchesStatus && matchesOwner;
  });

  return (
    <div className="flex gap-8">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">Responsibilities</h1>

        <div className="grid grid-cols-4 gap-6 mb-8">
          {STAT_CARDS.map((card, index) => (
            <StatCard key={index} title={card.title} value={card.value} />
          ))}
        </div>

        <FilterBar filters={filters} />

        <ResponsibilityTable
          tasks={filteredTasks}
          selectedId={selectedTask?.id ?? null}
          onSelect={setSelectedTask}
        />
      </div>

      {selectedTask && (
        <ResponsibilityDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
