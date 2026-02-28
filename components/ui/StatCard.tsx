type StatCardProps = {
    title: string;
    value: string | number;
    highlight?: boolean;
};

export default function StatCard({ title, value, highlight = false }: StatCardProps) {
    return (
        <div className="bg-[#112C70] rounded-xl border border-[#5B58EB]/30 p-6 shadow-[0_4px_20px_rgba(10,35,83,0.5)]">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">{title}</p>
            <p
                className={`text-2xl font-bold mt-2 ${highlight ? "text-[#00C896]" : "text-white"
                    }`}
            >
                {value}
            </p>
        </div>
    );
}