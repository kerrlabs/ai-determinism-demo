import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
}: {
  value: number; // 0..100
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
