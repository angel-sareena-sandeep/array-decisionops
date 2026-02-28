"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import { type EvidenceMessage } from "@/lib/contracts";

export type Task = {
  id: number;
  rawId: string;
  title: string;
  owner: string;
  due: string;
  status: string;
  evidenceCount: number;
  description: string;
  timestamp: string;
  evidence?: EvidenceMessage[];
};

type ResponsibilityTableProps = {
  tasks: Task[];
  selectedId: number | null;
  onSelect: (task: Task) => void;
};

export default function ResponsibilityTable({
  tasks,
  selectedId,
  onSelect,
}: ResponsibilityTableProps) {
  return (
    <div className="bg-[#112C70] rounded-xl border border-[#5B58EB]/30 shadow-[0_8px_30px_rgba(10,35,83,0.6)] overflow-hidden">
      <table className="w-full text-left text-white/90">
        <thead className="bg-[#5B58EB] text-white text-sm uppercase">
          <tr>
            <th className="p-4">Task</th>
            <th className="p-4">Owner</th>
            <th className="p-4">Due Date</th>
            <th className="p-4">Status</th>
            <th className="p-4">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length > 0
            ? tasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onSelect(task)}
                  className={`border-t border-[#5B58EB]/30 cursor-pointer hover:bg-[#5B58EB]/20 transition ${
                    selectedId === task.id
                      ? "bg-[#00C896]/10 border-l-4 border-[#00C896]"
                      : ""
                  }`}
                >
                  <td className="p-4 font-medium">{task.title}</td>
                  <td className="p-4">{task.owner}</td>
                  <td className="p-4">{task.due}</td>
                  <td className="p-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="p-4">{task.evidenceCount} msgs</td>
                </tr>
              ))
            : Array.from({ length: 5 }).map((_, idx) => (
                <tr key={`placeholder-${idx}`} className="border-t border-[#5B58EB]/30">
                  <td className="p-4 font-medium">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-1/2" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-1/3" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-20" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-10" />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}