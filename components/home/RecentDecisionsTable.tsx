type RecentDecision = {
    id: number;
    title: string;
    status: string;
    confidence: string;
    lastUpdated: string;
    evidenceCount: number;
};

type RecentDecisionsTableProps = {
    decisions: RecentDecision[];
};

export default function RecentDecisionsTable({
    decisions,
}: RecentDecisionsTableProps) {
    return (
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
                    {decisions.length > 0 ? (
                        decisions.map((item) => (
                            <tr key={item.id} className="border-b">
                                <td className="py-4">{item.title}</td>
                                <td
                                    className={`py-4 font-medium ${item.status === "Final"
                                            ? "text-green-600"
                                            : "text-yellow-600"
                                        }`}
                                >
                                    {item.status}
                                </td>
                                <td className="py-4">{item.confidence}</td>
                                <td className="py-4">{item.lastUpdated}</td>
                                <td className="py-4 text-right">{item.evidenceCount}</td>
                            </tr>
                        ))
                    ) : (
                        Array.from({ length: 5 }).map((_, idx) => (
                            <tr key={`placeholder-${idx}`} className="border-b">
                                <td className="py-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                                </td>
                                <td className="py-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                                </td>
                                <td className="py-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3" />
                                </td>
                                <td className="py-4">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                                </td>
                                <td className="py-4 text-right">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-8 ml-auto" />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
