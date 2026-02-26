"use client";

import { useState, useEffect, useCallback } from "react";
import StatCard from "@/components/ui/StatCard";
import FilterBar, { type FilterConfig } from "@/components/ui/FilterBar";
import ResponsibilityTable, {
  type Task,
} from "@/components/responsibilities/ResponsibilityTable";
import ResponsibilityDetailPanel from "@/components/responsibilities/ResponsibilityDetailPanel";
import { ResponsibilityItem } from "@/lib/contracts";

function apiToTask(item: ResponsibilityItem, idx: number): Task {
  return {
    id: idx,
    title: item.title,
    owner: item.owner,
    due: item.due ?? "",
    status: item.status,
    evidenceCount: 0,
    description: item.description ?? "",
    timestamp: item.timestamp,
  };
}

export default function ResponsibilitiesPage() {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");

  const loadTasks = useCallback(async () => {
    const chat_id = localStorage.getItem("decisionops_chat_id");
    if (!chat_id) return;
    const res = await fetch(`/api/responsibilities?chat_id=${chat_id}`);
    if (!res.ok) return;
    const items: ResponsibilityItem[] = await res.json();
    setAllTasks(items.map(apiToTask));
  }, []);

  useEffect(() => {
    loadTasks();
    const onImport = () => loadTasks();
    const onCleared = () => setAllTasks([]);
    window.addEventListener("decisionops:imported", onImport);
    window.addEventListener("decisionops:cleared", onCleared);
    return () => {
      window.removeEventListener("decisionops:imported", onImport);
      window.removeEventListener("decisionops:cleared", onCleared);
    };
  }, [loadTasks]);

  const uniqueOwners = Array.from(new Set(allTasks.map((t) => t.owner))).sort();

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
        ...uniqueOwners.map((o) => ({ value: o, label: o })),
      ],
    },
  ];

  const filteredTasks = allTasks.filter((task) => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || task.status === statusFilter;
    const matchesOwner = ownerFilter === "All" || task.owner === ownerFilter;
    return matchesSearch && matchesStatus && matchesOwner;
  });

  const openCount = allTasks.filter((t) => t.status === "Open").length;
  const completedCount = allTasks.filter(
    (t) => t.status === "Completed",
  ).length;
  const overdueCount = allTasks.filter((t) => t.status === "Overdue").length;

  const statCards = [
    { title: "Open Responsibilities", value: String(openCount) },
    { title: "Completed", value: String(completedCount) },
    { title: "Overdue", value: String(overdueCount) },
    { title: "Added Since Last Import", value: String(allTasks.length) },
  ];

  return (
    <div className="flex gap-8">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">
          Responsibilities
        </h1>

        <div className="grid grid-cols-4 gap-6 mb-8">
          {statCards.map((card, index) => (
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