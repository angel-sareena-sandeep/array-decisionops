"use client";

import { useEffect, useState } from "react";

export default function HomePage() {


  const metrics = [
    { title: "Messages Parsed", value: 12405 },
    { title: "New Messages", value: 142 },
    { title: "Duplicates Skipped", value: 84 },
    { title: "Decisions Detected", value: 28, highlight: true },
  ];

  const summaryCards = [
    { title: "Latest Valid Decisions", value: 156 },
    { title: "Decisions Updated (v2+)", value: 34 },
    { title: "Open Responsibilities", value: 12 },
    { title: "New Msgs Since Import", value: 89 },
  ];

  const decisions = [
    {
      id: 1,
      title: "Weekend Trip Destination",
      status: "Final",
      confidence: "98%",
      lastUpdated: "Today",
      evidenceCount: 12,
    },
    {
      id: 2,
      title: "Wedding Gift Selection",
      status: "Tentative",
      confidence: "65%",
      lastUpdated: "Yesterday",
      evidenceCount: 8,
    },
  ];

  

  return (
    <div className="space-y-10">

      {/* Top Bar */}
      <div className="flex justify-between items-center text-sm text-gray-600">
        <div className="flex gap-6">
          <p className="text-green-600 font-medium">● Last Import: 2 min ago</p>
          <p>Hash-Sync: Enabled</p>
          <p>Duplicates Skipped: 84</p>
        </div>
        
      </div>

      {/* Import + Metrics */}
      <div className="grid grid-cols-3 gap-6">

        {/* Import Box */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center">
            <p className="text-gray-600 font-medium">
              Drop WhatsApp export (.txt, .zip)
            </p>
            <p className="text-sm text-gray-400 mt-1">
              or click to browse
            </p>
          </div>

          <button className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition">
            Import & Sync
          </button>
        </div>

        {/* Metrics Right Side */}
        <div className="grid grid-cols-2 gap-6">
          {metrics.map((item, index) => (
            <div key={index} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-xs text-gray-500">{item.title}</p>
              <p className={`text-2xl font-bold mt-2 ${item.highlight ? "text-blue-600" : "text-gray-900"}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Second Row Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        {summaryCards.map((item, index) => (
          <div key={index} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-xs text-gray-500">{item.title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Decisions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Decisions Extracted
          </h2>

          <div className="flex gap-3">
            <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition">
              Filter
            </button>
            
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="text-gray-500 border-b">
            <tr>
              <th className="pb-3">Decision Title</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Confidence</th>
              <th className="pb-3">Last Updated</th>
              <th className="pb-3 text-right">Evidence Count</th>
            </tr>
          </thead>

          <tbody className="text-gray-700">
            {decisions.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-4">{item.title}</td>
                <td className={`py-4 font-medium ${item.status === "Final" ? "text-green-600" : "text-yellow-600"}`}>
                  {item.status}
                </td>
                <td className="py-4">{item.confidence}</td>
                <td className="py-4">{item.lastUpdated}</td>
                <td className="py-4 text-right">{item.evidenceCount}</td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
    </div>
  );
}