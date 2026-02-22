type StatCardProps = {
    title: string;
    value: string | number;
    highlight?: boolean;
};

export default function StatCard({ title, value, highlight = false }: StatCardProps) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-xs text-gray-500">{title}</p>
            <p
                className={`text-2xl font-bold mt-2 ${highlight ? "text-blue-600" : "text-gray-900"
                    }`}
            >
                {value}
            </p>
        </div>
    );
}
