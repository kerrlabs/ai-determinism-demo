import type { AppConfig, Question, Unit } from "@/lib/types";

export async function fetchConfig(): Promise<AppConfig> {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error(`config ${r.status}`);
  return r.json();
}

export async function fetchQuestions(): Promise<Question[]> {
  const r = await fetch("/api/questions");
  if (!r.ok) throw new Error(`questions ${r.status}`);
  return r.json();
}

/** Format a numeric value according to the question's unit. */
export function formatValue(value: number | null | undefined, unit: Unit): string {
  if (value == null) return "—";
  if (unit === "currency")
    return (
      "$" +
      value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  if (unit === "ratio") return value.toFixed(2) + "%";
  return value.toLocaleString();
}
