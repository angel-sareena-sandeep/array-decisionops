type ConfidenceBarProps = {
    value: number; // 0–100
};

export default function ConfidenceBar({ value }: ConfidenceBarProps) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-24 bg-gray-200 rounded-full h-2">
                <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${value}%` }}
                />
            </div>
            <span className="text-sm font-medium">{value}%</span>
        </div>
    );
}
