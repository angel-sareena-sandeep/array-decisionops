import Sidebar from "@/components/layout/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0A2353]">
      <div className="p-4 flex-shrink-0">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto p-10">{children}</main>
    </div>
  );
}