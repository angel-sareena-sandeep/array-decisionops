export default function UploadPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-6">
        Upload WhatsApp Chat
      </h1>

      <p className="text-gray-600 mb-6 text-center">
        Upload your exported WhatsApp .txt file to analyze decisions.
      </p>

      <input
        type="file"
        accept=".txt"
        className="mb-6 border p-3 rounded-md"
      />

      <button className="px-6 py-3 rounded-md border">
        Analyze
      </button>
    </main>
  );
}
