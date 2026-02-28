type TopStatusBarProps = {
    lastImport?: string;
    duplicatesSkipped?: number;
};

export default function TopStatusBar({
    lastImport,
    duplicatesSkipped,
}: TopStatusBarProps) {
    return (
        <div className="flex justify-between items-center text-sm text-white/60">
            <div className="flex gap-6">
                <p className="text-[#56E1E9] font-medium">● Last Import: {lastImport ?? "-"}</p>
                <p className="text-white/60">Duplicates Skipped: {duplicatesSkipped ?? "-"}</p>
            </div>
        </div>
    );
}
