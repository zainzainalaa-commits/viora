import { Key } from "lucide-react";

export function KeyIcon({ size = 18 }: { size?: number }) {
  return (
    <span className="harbor-key inline-flex" style={{ color: "var(--color-accent)" }}>
      <Key size={size} strokeWidth={1.75} />
    </span>
  );
}
