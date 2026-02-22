export default function ImportCard() {
    return (
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center">
                <p className="text-gray-600 font-medium">
                    Drop WhatsApp export (.txt, .zip)
                </p>
                <p className="text-sm text-gray-400 mt-1">or click to browse</p>
            </div>

            <button className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition">
                Import &amp; Sync
            </button>
        </div>
    );
}
