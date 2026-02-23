"use client";

import StatusBadge from "@/components/ui/StatusBadge";

export type Task = {
    id: number;
    title: string;
    owner: string;
    due: string;
    status: string;
    evidenceCount: number;
    description: string;
    timestamp: string;
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
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-left text-gray-800">
                <thead className="bg-gray-100 text-gray-600 text-sm uppercase">
                    <tr>
                        <th className="p-4">Task</th>
                        <th className="p-4">Owner</th>
                        <th className="p-4">Due Date</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Evidence</th>
                    </tr>
                </thead>
                <tbody>
                    {tasks.length > 0 ? (
                        tasks.map((task) => (
                            <tr
                                key={task.id}
                                onClick={() => onSelect(task)}
                                className={`border-t cursor-pointer hover:bg-gray-50 transition ${selectedId === task.id
                                    ? "bg-blue-50 border-l-4 border-blue-500"
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
                    ) : (
                        Array.from({ length: 5 }).map((_, idx) => (
                            <tr key={`placeholder-${idx}`} className="border-t">
                                <td className="p-4 font-medium">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-10" />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
