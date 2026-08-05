export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "end";
}) {
  return (
    <div className="group/tip relative inline-flex">
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[12px] font-medium text-white opacity-0 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md transition-opacity duration-150 group-hover/tip:opacity-100 ${
          side === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
        } ${align === "end" ? "end-0" : "left-1/2 -translate-x-1/2"}`}
      >
        {label}
      </div>
    </div>
  );
}
