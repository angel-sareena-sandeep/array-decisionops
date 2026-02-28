type StatusBadgeProps = {
  status: string;
};

const statusStyles: Record<string, string> = {
  Final: "bg-[#00C896]/20 text-[#00C896] font-semibold",
  Tentative: "bg-[#BB63FF]/20 text-[#BB63FF] font-semibold",
  Open: "bg-[#5B58EB]/30 text-white font-semibold",
  Completed: "bg-[#00C896]/20 text-[#00C896] font-semibold",
  Overdue: "bg-red-500/20 text-red-400 font-semibold",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-white/10 text-white/60";
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}