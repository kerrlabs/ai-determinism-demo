import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
}

export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Views"
      className={cn("flex flex-wrap justify-center gap-1.5", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
              active
                ? "border-transparent bg-[var(--color-accent)] font-bold text-[#06122b]"
                : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
