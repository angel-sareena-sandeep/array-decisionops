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
        <div className="flex gap-6 border-b mb-6 text-sm font-medium">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onTabChange(tab.key)}
                    className={`pb-2 ${activeTab === tab.key
                            ? "border-b-2 border-blue-600 text-blue-600"
                            : "text-gray-600"
                        }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
