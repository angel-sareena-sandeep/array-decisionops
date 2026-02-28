"use client";

export type FilterConfig =
    | {
        type: "search";
        label: string;
        placeholder: string;
        value: string;
        onChange: (value: string) => void;
    }
    | {
        type: "select";
        label: string;
        value: string;
        onChange: (value: string) => void;
        options: { value: string; label: string }[];
    };

type FilterBarProps = {
    filters: FilterConfig[];
};

export default function FilterBar({ filters }: FilterBarProps) {
    return (
        <div className="bg-[#112C70] p-6 rounded-xl border border-[#5B58EB]/30 shadow-[0_4px_20px_rgba(10,35,83,0.5)] mb-6">
            <div className="flex flex-wrap gap-8 items-end">
                {filters.map((filter, index) => (
                    <div key={index} className="flex flex-col">
                        <label className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
                            {filter.label}
                        </label>

                        {filter.type === "search" ? (
                            <input
                                type="text"
                                placeholder={filter.placeholder}
                                value={filter.value}
                                onChange={(e) => filter.onChange(e.target.value)}
                                className="border border-[#5B58EB]/60 rounded-lg px-4 py-2 text-sm w-64
                           bg-[#0A2353]/80 text-white placeholder-white/30
                           focus:outline-none focus:ring-2 focus:ring-[#56E1E9]"
                            />
                        ) : (
                            <select
                                value={filter.value}
                                onChange={(e) => filter.onChange(e.target.value)}
                                className="border border-[#5B58EB]/60 rounded-lg px-4 py-2 text-sm
                           bg-[#0A2353]/80 text-white
                           focus:outline-none focus:ring-2 focus:ring-[#56E1E9]
                           cursor-pointer"
                            >
                                {filter.options.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}