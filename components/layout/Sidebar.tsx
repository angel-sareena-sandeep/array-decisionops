"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
    { label: "Home", href: "/home" },
    { label: "Decisions", href: "/decisions" },
    { label: "Responsibilities", href: "/responsibilities" },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-[#112C70] rounded-3xl p-6 flex flex-col h-full overflow-y-auto shadow-[0_8px_40px_rgba(10,35,83,0.8)]">
            <div className="mb-8">
                <Link href="/home" className="flex items-center">
                    {/* Mobile: cube only */}
                    <Image
                        src="/cube.svg"
                        alt="ARRAY"
                        width={36}
                        height={36}
                        className="block sm:hidden"
                        priority
                    />
                    {/* Tablet/Desktop: full logo with text */}
                    <Image
                        src="/logo-full.png"
                        alt="ARRAY"
                        width={140}
                        height={36}
                        className="hidden sm:block"
                        priority
                    />
                </Link>
                <p className="text-sm font-medium text-[#56E1E9]/60 mt-4">
                    From chat noise to traceable decisions
                </p>
            </div>

            <nav className="flex flex-col gap-1">
                {navItems.map(({ label, href }) => {
                    const isActive = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                    ? "bg-[#5B58EB] text-white border-l-4 border-[#00C896] pl-2"
                                    : "text-white/60 hover:bg-[#5B58EB]/30 hover:text-white"
                                }`}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}