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
        <div className="bg-gray-100 p-6 rounded-xl border border-gray-300 shadow-md mb-6">
            <div className="flex flex-wrap gap-8 items-end">
                {filters.map((filter, index) => (
                    <div key={index} className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-600 mb-2">
                            {filter.label}
                        </label>

                        {filter.type === "search" ? (
                            <input
                                type="text"
                                placeholder={filter.placeholder}
                                value={filter.value}
                                onChange={(e) => filter.onChange(e.target.value)}
                                className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-64
                           bg-white text-gray-900 placeholder-gray-400
                           focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                        ) : (
                            <select
                                value={filter.value}
                                onChange={(e) => filter.onChange(e.target.value)}
                                className="border border-gray-400 rounded-lg px-4 py-2 text-sm
                           bg-white text-gray-900
                           focus:outline-none focus:ring-2 focus:ring-blue-600
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
