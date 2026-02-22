
"use client";

import { useState, useEffect } from "react";

export default function ResponsibilitiesPage() {
 const [tasks, setTasks] = useState<any[]>([]);
  
    

  const [selectedTask, setSelectedTask] =
    useState<(typeof tasks)[0] | null>(null);
  

  const [activeTab, setActiveTab] = useState("details");
  const [searchTerm, setSearchTerm] = useState("");
const [statusFilter, setStatusFilter] = useState("All");
const [ownerFilter, setOwnerFilter] = useState("All");
  useEffect(() => {
  const mockData = [
    {
      id: 1,
      title: "Book venue for retreat",
      owner: "Michael Chen",
      linkedDecision: "Q4 Offsite Planning",
    
      due: "Oct 30, 2023",
      status: "Open",
      evidenceCount: 12,
      description:
        "Identify and secure a location for the Q4 team offsite. Needs to accommodate 25 people.",
      timestamp: "2023-10-24T14:32:00",
    },
    {
      id: 2,
      title: "Finalize Q3 Report",
      owner: "Sarah",
       linkedDecision: "Q4 Offsite Planning",
      due: "Oct 15, 2023",
      status: "Overdue",
      evidenceCount: 12,
      description: "Prepare and finalize the Q3 performance report.",
      timestamp: "2023-10-20T09:15:00",
    },
    {
      id: 3,
      title: "Review Q4 Budget",
      owner: "David",
       linkedDecision: "Q4 Offsite Planning",
      due: "Nov 02, 2023",
      status: "Completed",
            evidenceCount: 12,

      description: "Review budget allocations for Q4 planning.",
      timestamp: "2023-10-18T16:45:00",
    },
  ];

  setTasks(mockData);
}, []);

  const formatTimestamp = (date: string) => {
    return  new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
const filteredTasks = tasks.filter((task) => {
  const matchesSearch = task.title
    .toLowerCase()
    .includes(searchTerm.toLowerCase());

  const matchesStatus =
    statusFilter === "All" || task.status === statusFilter;

  const matchesOwner =
    ownerFilter === "All" || task.owner === ownerFilter;

  return matchesSearch && matchesStatus && matchesOwner;
});
  return (
    <div className="flex gap-8">
      {/* LEFT SIDE */}
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">
          Responsibilities
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard title="Open Responsibilities" value="12" />
          <StatCard title="Completed" value="45" />
          <StatCard title="Overdue" value="3" />
          <StatCard title="Added Since Last Import" value="+8" />
        </div>
<div className="bg-gray-100 p-6 rounded-xl border border-gray-300 shadow-md mb-6">
  <div className="flex flex-wrap gap-8 items-end">

    {/* SEARCH */}
    <div className="flex flex-col">
      <label className="text-xs font-semibold text-gray-600 mb-2">
        Search Task
      </label>
      <input
        type="text"
        placeholder="Type task name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
      />
    </div>

    {/* STATUS */}
    <div className="flex flex-col">
      <label className="text-xs font-semibold text-gray-600 mb-2">
        Status
      </label>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white"
      >
        <option value="All">All</option>
        <option value="Open">Open</option>
        <option value="Completed">Completed</option>
        <option value="Overdue">Overdue</option>
      </select>
    </div>

    {/* OWNER */}
    <div className="flex flex-col">
      <label className="text-xs font-semibold text-gray-600 mb-2">
        Owner
      </label>
      <select
        value={ownerFilter}
        onChange={(e) => setOwnerFilter(e.target.value)}
        className="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white"
      >
        <option value="All">All</option>
        <option value="Michael Chen">Michael Chen</option>
        <option value="Sarah">Sarah</option>
        <option value="David">David</option>
      </select>
    </div>

  </div>
</div>
        {/* Table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-left text-gray-800">
            <thead className="bg-gray-100 text-gray-600 text-sm uppercase">
              <tr>
                <th className="p-4">Task</th>
                <th className="p-4">Owner</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Status</th>
                <th className="p-4">Linked Decision</th>
                <th className="p-4">Evidence</th>
              </tr>
            </thead>

            <tbody>
              {filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setActiveTab("details");
                  }}
                  className={`border-t cursor-pointer hover:bg-gray-50 transition ${
                    selectedTask?.id === task.id
                      ? "bg-blue-50 border-l-4 border-blue-500"
                      : ""
                  }`}
                >
                  <td className="p-4 font-medium">{task.title}</td>
                  <td className="p-4">{task.owner}</td>
                  <td className="p-4">{task.due}</td>
                  <td className="p-4 text-sm">{task.status}</td>
                  <td className="p-4">{task.linkedDecision}</td>
                  <td className="p-4">{task.evidenceCount} msgs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT SIDE PANEL — ONLY SHOW IF TASK SELECTED */}
      {selectedTask && (
        <div className="w-96 bg-white rounded-xl border shadow-sm p-8 relative">
          {/* Status Badge */}
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 ${
              selectedTask.status === "Open"
                ? "bg-blue-100 text-blue-600"
                : selectedTask.status === "Completed"
                ? "bg-green-100 text-green-600"
                : "bg-red-100 text-red-600"
            }`}
          >
            {selectedTask.status}
          </span>

          {/* Title */}
          <h2 className="text-xl font-semibold mb-6 text-gray-900">
            {selectedTask.title}
          </h2>

          <div className="border-b mb-6"></div>

          {/* Tabs */}
          <div className="flex gap-6 border-b mb-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab("details")}
              className={`pb-2 ${
                activeTab === "details"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-600"
              }`}
            >
              Task Details
            </button>

            <button
              onClick={() => setActiveTab("evidence")}
              className={`pb-2 ${
                activeTab === "evidence"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-600"
              }`}
            >
              Evidence
            </button>

            <button
              onClick={() => setActiveTab("linked")}
              className={`pb-2 ${
                activeTab === "linked"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-600"
              }`}
            >
              Linked Decision
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "details" && (
            <div className="space-y-6 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase mb-2">
                  Description
                </p>
                <p className="text-gray-800">
                  {selectedTask.description}
                </p>
              </div>

              <div>
                <p className="text-gray-400 text-xs uppercase mb-2">
                  Due Date
                </p>
                <p className="font-medium text-gray-700">
                  {selectedTask.due}
                </p>
              </div>

              <div>
                <p className="text-gray-400 text-xs uppercase mb-2">
                  Owner
                </p>
                <p className="font-medium text-gray-700">
                  {selectedTask.owner}
                </p>
              </div>
            </div>
          )}

          {activeTab === "evidence" && (
            <div className="space-y-4 text-sm text-gray-700">
              <p className="font-medium text-gray-900">
                Extracted from WhatsApp conversation
              </p>

              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">
                  Timestamp
                </p>
                <p className="text-gray-800">
                  {formatTimestamp(selectedTask.timestamp)}
                </p>
              </div>
            </div>
          )}

          {activeTab === "linked" && (
            <div className="text-sm text-gray-700">
              <p>Linked to decision:</p>
              <p className="font-medium mt-2 text-gray-900">
                Q4 Offsite Planning
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-6 rounded-xl border shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-3 text-gray-900">{value}</p>
    </div>
  );
}
