type TopStatusBarProps = {
    lastImport?: string;
    hashSync?: boolean;
    duplicatesSkipped?: number;
};

export default function TopStatusBar({
    lastImport = "2 min ago",
    hashSync = true,
    duplicatesSkipped = 84,
}: TopStatusBarProps) {
    return (
        <div className="flex justify-between items-center text-sm text-gray-600">
            <div className="flex gap-6">
                <p className="text-green-600 font-medium">● Last Import: {lastImport}</p>
                <p>Hash-Sync: {hashSync ? "Enabled" : "Disabled"}</p>
                <p>Duplicates Skipped: {duplicatesSkipped}</p>
            </div>
        </div>
    );
}
