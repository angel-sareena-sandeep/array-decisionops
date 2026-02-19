export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-6 max-w-xl px-6">
        <h1 className="text-4xl font-bold tracking-tight">
          ARRAY DecisionOps
        </h1>

        <p className="text-gray-600 text-lg">
          Turn WhatsApp chats into structured decisions.
        </p>

        <div className="flex justify-center gap-4 pt-4">
          <a
            href="/upload"
            className="px-6 py-3 rounded-md border border-black font-medium hover:bg-black hover:text-white transition"
          >
            Upload
          </a>

          <a
            href="/dashboard"
            className="px-6 py-3 rounded-md border border-black font-medium hover:bg-black hover:text-white transition"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
