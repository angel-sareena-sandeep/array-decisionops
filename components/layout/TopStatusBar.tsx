type TopStatusBarProps = {
    lastImport?: string;
    duplicatesSkipped?: number;
};

export default function TopStatusBar({
    lastImport,
    duplicatesSkipped,
}: TopStatusBarProps) {
    return (
        <div className="flex justify-between items-center text-sm text-gray-600">
            <div className="flex gap-6">
                <p className="text-green-600 font-medium">● Last Import: {lastImport ?? "-"}</p>
                <p>Duplicates Skipped: {duplicatesSkipped ?? "-"}</p>
            </div>
        </div>
    );
}
