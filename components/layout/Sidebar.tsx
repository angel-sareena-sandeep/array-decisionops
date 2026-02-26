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
        <aside className="w-64 bg-white border-r p-6 flex flex-col">
            <div className="mb-8">
                <Link href="/home" className="flex items-center">
                    {/* Mobile: cube only */}
                    <Image
                        src="/cube.png"
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
                <p className="text-sm font-medium text-gray-500 mt-2">
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
                                    ? "bg-blue-50 text-blue-700 border-l-4 border-blue-600 pl-2"
                                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
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
