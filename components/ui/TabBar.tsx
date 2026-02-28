"use client";

type Tab = {
    key: string;
    label: string;
};

type TabBarProps = {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (key: string) => void;
};

export default function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
    return (
        <div className="flex gap-6 border-b border-[#5B58EB]/30 mb-6 text-sm font-medium">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onTabChange(tab.key)}
                    className={`pb-2 ${activeTab === tab.key
                            ? "border-b-2 border-[#56E1E9] text-[#56E1E9]"
                            : "text-white/40 hover:text-white"
                        }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}