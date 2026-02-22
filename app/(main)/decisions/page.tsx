"use client";

import { useState, useEffect } from "react";

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [confidenceFilter, setConfidenceFilter] = useState("All");

  // TEMP MOCK DATA (replace with backend later)
  useEffect(() => {
    const mockData = [
      {
        id: 1,
        title: "Finalize Q4 Offsite Location",
        version: 3,
        status: "Final",
        confidence: 82,
        lastUpdated: "Oct 24, 2023",
        messages: 14,
        explanation:
          "Team agreed to book the Mountain View Retreat Center for Q4 offsite.",
        timestamp: "2023-10-24T14:32:00",
      },
      {
        id: 2,
        title: "Approve Marketing Budget",
        version: 2,
        status: "Tentative",
        confidence: 64,
        lastUpdated: "Oct 22, 2023",
        messages: 9,
        explanation:
          "Marketing budget proposal approved conditionally pending CFO review.",
        timestamp: new Date("2023-10-22T09:15:00"),
      },
    ];

    setDecisions(mockData);
  }, []);
  const formatTimestamp = (date: string) => {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

  // FILTER LOGIC
  const filteredDecisions = decisions.filter((decision) => {
    const matchesSearch = decision.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || decision.status === statusFilter;

    const matchesConfidence =
      confidenceFilter === "All" ||
      (confidenceFilter === "High" && decision.confidence >= 75) ||
      (confidenceFilter === "Medium" &&
        decision.confidence >= 50 &&
        decision.confidence < 75) ||
      (confidenceFilter === "Low" && decision.confidence < 50);

    return matchesSearch && matchesStatus && matchesConfidence;
  });

  return (
    <div className="flex gap-8">
      {/* LEFT SIDE */}
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">
          Decisions
        </h1>

        {/* SEARCH + FILTERS */}
<div className="bg-gray-100 p-6 rounded-xl border border-gray-300 shadow-md mb-6">
  <div className="flex flex-wrap gap-8 items-end">

    {/* SEARCH */}
    <div className="flex flex-col">
      <label className="text-xs font-semibold text-gray-600 mb-2">
        Search Decision
      </label>
      <input
        type="text"
        placeholder="Type decision title..."
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
        className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
      >
        <option value="All">All</option>
        <option value="Final">Final</option>
        <option value="Tentative">Tentative</option>
      </select>
    </div>

    {/* CONFIDENCE */}
    <div className="flex flex-col">
      <label className="text-xs font-semibold text-gray-600 mb-2">
        Confidence
      </label>
      <select
        value={confidenceFilter}
        onChange={(e) => setConfidenceFilter(e.target.value)}
        className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
      >
        <option value="All">All</option>
        <option value="High">High (75%+)</option>
        <option value="Medium">Medium (50–74%)</option>
        <option value="Low">Low (&lt;50%)</option>
      </select>
    </div>

  </div>
</div>

        {/* TABLE */}
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
              {filteredDecisions.map((decision) => (
                <tr
                  key={decision.id}
                  onClick={() => {
                    setSelectedDecision(
                      selectedDecision?.id === decision.id
                        ? null
                        : decision
                    );
                    setActiveTab("details");
                  }}
                  className={`border-t cursor-pointer hover:bg-gray-50 transition ${
                    selectedDecision?.id === decision.id
                      ? "bg-blue-50 border-l-4 border-blue-500"
                      : ""
                  }`}
                >
                  <td className="p-4 font-medium">
                    {decision.title}
                  </td>

                  <td className="p-4">v{decision.version}</td>

                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        decision.status === "Final"
                          ? "bg-green-100 text-green-600"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {decision.status}
                    </span>
                  </td>

                  <td className="p-4 w-40">
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${decision.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {decision.confidence}%
                      </span>
                    </div>
                  </td>

                  <td className="p-4">{decision.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT PANEL */}
      {selectedDecision && (
        <div className="w-96 bg-white rounded-xl border shadow-sm p-8 relative">
          <button
            onClick={() => setSelectedDecision(null)}
            className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 ${
              selectedDecision.status === "Final"
                ? "bg-green-100 text-green-600"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {selectedDecision.status}
          </span>

          <h2 className="text-xl font-semibold mb-6 text-gray-900">
            {selectedDecision.title}
          </h2>

          <div className="border-b mb-6"></div>

          <div className="flex gap-6 border-b mb-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab("details")}
              className={`pb-2 ${
                activeTab === "details"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-600"
              }`}
            >
              Details
            </button>

            <button
              onClick={() => setActiveTab("evidence")}
              className={`pb-2 ${
                activeTab === "evidence"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-700"
              }`}
            >
              Evidence
            </button>

            <button
              onClick={() => setActiveTab("versions")}
              className={`pb-2 ${
                activeTab === "versions"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-700"
              }`}
            >
              Versions
            </button>
          </div>

          {activeTab === "details" && (
            <div className="space-y-6 text-sm">
              <div>
                <p className="text-gray-800 leading-relaxed">
  {selectedDecision.explanation}
</p>
              </div>
            </div>
          )}

          {activeTab === "evidence" && (
            <div className="text-gray-800 text-sm leading-relaxed">
              <p className="font-medium">Extracted from WhatsApp chat</p>
              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">
                  Timestamp
                </p>
                <p>{formatTimestamp(selectedDecision.timestamp)}</p>
              </div>
            </div>
          )}

          {activeTab === "versions" && (
            <div className="text-gray-800 leading-relaxed">
              <p>Current Version: v{selectedDecision.version}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}