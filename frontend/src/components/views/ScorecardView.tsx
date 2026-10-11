import { Card } from "@/components/ui/card";
import { formatValue } from "@/lib/api";
import type { RunState } from "@/hooks/useRunStream";
import type { AgentSummary, Question, Unit } from "@/lib/types";

function row(label: string, aVal: string, bVal: string) {
  return { label, aVal, bVal };
}

function buildRows(a: AgentSummary, b: AgentSummary, unit: Unit) {
  const pct = (s: AgentSummary) => (s.n_runs ? `${Math.round((100 * s.n_correct) / s.n_runs)}%` : "—");
  const range = (s: AgentSummary) =>
    s.min == null ? "—" : `${formatValue(s.min, unit)} – ${formatValue(s.max, unit)}`;
  const det = (s: AgentSummary) => (s.distinct_values <= 1 ? "✓ yes" : "✗ no");
  return [
    row("different answers", String(a.distinct_values), String(b.distinct_values)),
    row("got it right", pct(a), pct(b)),
    row("typical answer", formatValue(a.mean, unit), formatValue(b.mean, unit)),
    row("spread (σ)", a.stdev == null ? "—" : a.stdev.toFixed(2), b.stdev == null ? "—" : b.stdev.toFixed(2)),
    row("range", range(a), range(b)),
    row("same answer every time?", det(a), det(b)),
    row("can you check its work?", "✗ no", "✓ yes (the formula)"),
  ];
}

export function ScorecardView({ state, question }: { state: RunState; question: Question | null }) {
  const sum = state.summary;
  if (!sum) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center text-sm text-[var(--color-muted)]">
        Run a comparison to see the final scorecard.
      </Card>
    );
  }
  const rows = buildRows(sum.A, sum.B, state.unit);

  // worst-case Agent A deviation
  let worst: number | null = null;
  let worstDelta = -1;
  for (const v of sum.A.answers) {
    const d = Math.abs(v - sum.truth);
    if (d > worstDelta) {
      worstDelta = d;
      worst = v;
    }
  }
  const pctOff = sum.truth !== 0 && worst != null ? Math.round((worstDelta / Math.abs(sum.truth)) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <table className="w-full overflow-hidden rounded-xl border border-[var(--color-border)]">
        <thead>
          <tr className="bg-[var(--color-panel-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <th className="p-3"></th>
            <th className="p-3">Helper A — reads data</th>
            <th className="p-3">Helper B — writes formula</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[var(--color-border)] text-sm">
              <td className="p-3 text-[var(--color-muted)]">{r.label}</td>
              <td className="tabular p-3" style={{ color: "#ffd0d5" }}>{r.aVal}</td>
              <td className="tabular p-3" style={{ color: "#c8f5da" }}>{r.bVal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {worst != null && (
        <Card className="mt-5 border-l-4 border-l-[var(--color-truth)] p-4 text-sm leading-relaxed">
          <strong>Cost of being wrong.</strong> Asked "
          <em className="not-italic text-[var(--color-text)]">{question?.prompt ?? "this question"}</em>", Helper A's
          worst attempt said <strong>{formatValue(worst, state.unit)}</strong> vs. the true{" "}
          <strong>{formatValue(sum.truth, state.unit)}</strong> — off by <strong>{pctOff}%</strong>. Across{" "}
          {sum.A.n_runs} tries it gave <strong>{sum.A.distinct_values}</strong> different answers. Helper B returned
          the exact figure every time. If this number drove a financial report, an inventory order, or a dosing
          calculation, that difference is the line between a decision you can defend and one you cannot.
        </Card>
      )}
    </div>
  );
}
