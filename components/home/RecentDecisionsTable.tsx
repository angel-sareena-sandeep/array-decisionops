import ConfidenceBar from "@/components/ui/ConfidenceBar";
import StatusBadge from "@/components/ui/StatusBadge";

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
        <div className="bg-[#112C70] rounded-xl border border-[#5B58EB]/30 shadow-[0_4px_20px_rgba(10,35,83,0.5)] p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-white">
                    Recent Decisions Extracted
                </h2>
                <div className="flex gap-3">
                    <button className="bg-[#5B58EB] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#5B58EB]/80 transition font-medium shadow-sm">
                        Filter
                    </button>
                </div>
            </div>

            <div className="rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#5B58EB] text-white text-sm uppercase">
                    <tr>
                        <th className="p-4">Decision Title</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Confidence</th>
                        <th className="p-4">Last Updated</th>
                        <th className="p-4 text-right">Evidence Count</th>
                    </tr>
                </thead>
                <tbody className="text-white/90">
                    {decisions.length > 0 ? (
                        decisions.map((item) => (
                            <tr key={item.id} className="border-b border-[#5B58EB]/30 hover:bg-[#5B58EB]/20 transition">
                                <td className="p-4">{item.title}</td>
                                <td className="p-4">
                                    <StatusBadge status={item.status} />
                                </td>
                                <td className="p-4 w-36">
                                    <ConfidenceBar value={parseInt(item.confidence)} />
                                </td>
                                <td className="p-4">{item.lastUpdated}</td>
                                <td className="p-4 text-right">{item.evidenceCount}</td>
                            </tr>
                        ))
                    ) : (
                        Array.from({ length: 5 }).map((_, idx) => (
                            <tr key={`placeholder-${idx}`} className="border-b border-[#5B58EB]/30">
                                <td className="p-4">
                                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-white/10 rounded animate-pulse w-1/2" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-white/10 rounded animate-pulse w-1/3" />
                                </td>
                                <td className="p-4">
                                    <div className="h-4 bg-white/10 rounded animate-pulse w-1/2" />
                                </td>
                                <td className="p-4 text-right">
                                    <div className="h-4 bg-white/10 rounded animate-pulse w-8 ml-auto" />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
            </div>
        </div>
    );
}