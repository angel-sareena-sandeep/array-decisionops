type StatusBadgeProps = {
  status: string;
};

const statusStyles: Record<string, string> = {
  Final: "bg-green-100 text-green-600",
  Tentative: "bg-yellow-100 text-yellow-700",
  Open: "bg-blue-100 text-blue-600",
  Completed: "bg-green-100 text-green-600",
  Overdue: "bg-red-100 text-red-600",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
