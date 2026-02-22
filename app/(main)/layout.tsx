export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-100">
      
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r p-6">
        <div className="mb-8">
  <h2 className="text-xl font-bold text-gray-900">
    ARRAY
  </h2>
  <p className="text-sm font-medium text-gray-500 mt-1">
    From chat noise to traceable decisions
  </p>
</div>

        <nav className="flex flex-col gap-4 text-gray-700 font-medium">
          <a
            href="/home"
            className="hover:text-blue-600 transition-colors"
          >
            Home
          </a>

          <a
            href="/decisions"
            className="hover:text-blue-600 transition-colors"
          >
            Decisions
          </a>

          <a
            href="/responsibilities"
            className="hover:text-blue-600 transition-colors"
          >
            Responsibilities
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10">
        {children}
      </main>
    </div>
  );
}