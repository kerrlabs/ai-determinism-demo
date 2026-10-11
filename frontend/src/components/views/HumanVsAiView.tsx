import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatValue } from "@/lib/api";
import type { RunState } from "@/hooks/useRunStream";
import type { Question } from "@/lib/types";

export function HumanVsAiView({ state, question }: { state: RunState; question: Question | null }) {
  const unit = state.unit;
  const truth = state.truth;
  const sum = state.summary;
  const a = sum?.A;
  const b = sum?.B;

  const hurry =
    a && a.min != null && a.max != null && a.min !== a.max
      ? `${formatValue(a.min, unit)} … ${formatValue(a.max, unit)}`
      : a?.mean != null
        ? formatValue(a.mean, unit)
        : "—";

  const aMirror =
    a && a.distinct_values > 1 ? `${a.distinct_values} different answers` : a ? formatValue(a.mean, unit) : "—";

  return (
    <div>
      <p className="mx-auto mb-5 max-w-3xl text-center text-sm text-[var(--color-muted)]">
        It isn't "humans vs. AI" — it's <em className="not-italic font-semibold text-[var(--color-text)]">method vs. method</em>.
        The same person is unreliable or exact depending on whether they use a tool. The AI mirrors
        whichever method it's set up to use.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Human in a hurry */}
        <Card className="flex flex-col gap-2 border-t-2 border-t-[var(--color-agent-a)] p-5">
          <div className="text-3xl">🤔</div>
          <h3 className="text-lg font-semibold">Human, in a hurry</h3>
          <p className="text-sm text-[var(--color-muted)]">
            Glances at the giant sheet and adds it up <strong className="text-[var(--color-text)]">in their head</strong>.
          </p>
          <div className="my-1 text-xl font-extrabold tabular" style={{ color: "var(--color-agent-a)" }}>
            {hurry}
          </div>
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            Fast and confident, but guessing. Ask twice, get two different numbers.
          </p>
        </Card>

        {/* Human analyst */}
        <Card className="flex flex-col gap-2 border-t-2 border-t-[var(--color-agent-b)] p-5">
          <div className="text-3xl">🧮</div>
          <h3 className="text-lg font-semibold">Human analyst</h3>
          <p className="text-sm text-[var(--color-muted)]">
            Writes a spreadsheet <strong className="text-[var(--color-text)]">formula</strong> and lets the sheet do the math:
          </p>
          <code className="break-words rounded-md border border-[var(--color-border)] bg-[#0e1430] px-2 py-1.5 text-xs text-[#a9c7ff]">
            {question?.formula ?? "—"}
          </code>
          <div className="my-1 text-xl font-extrabold tabular" style={{ color: "var(--color-correct)" }}>
            {formatValue(truth, unit)}
          </div>
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            The tool computes, not the person. Same formula → same answer, every time.
          </p>
        </Card>

        {/* AI mirror */}
        <Card className="flex flex-col gap-3 border-t-2 border-t-[var(--color-accent)] p-5">
          <div className="text-3xl">🤖</div>
          <h3 className="text-lg font-semibold">What the AI did</h3>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] p-3">
            <Badge variant="a">Helper A = the hurried human</Badge>
            <div className="mt-2 text-lg font-bold tabular" style={{ color: "var(--color-agent-a)" }}>{aMirror}</div>
            {a && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {a.distinct_values} distinct over {a.n_runs} tries · {a.n_runs ? Math.round((100 * a.n_correct) / a.n_runs) : 0}% right
              </div>
            )}
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] p-3">
            <Badge variant="b">Helper B = the analyst</Badge>
            <div className="mt-2 text-lg font-bold tabular" style={{ color: "var(--color-agent-b)" }}>
              {b?.mean != null ? formatValue(b.mean, unit) : "—"}
            </div>
            {b && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {b.distinct_values} distinct over {b.n_runs} tries · {b.n_runs ? Math.round((100 * b.n_correct) / b.n_runs) : 0}% right
              </div>
            )}
          </div>
        </Card>
      </div>

      <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-[var(--color-muted)]">
        Ground truth: <strong style={{ color: "var(--color-truth)" }}>{formatValue(truth, unit)}</strong>. The human
        columns are illustrative; the AI columns are real results from this run.
      </p>
    </div>
  );
}
