import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { formatValue } from "@/lib/api";
import { symmetricHalfSpan } from "@/lib/scale";
import type { AgentRunState, RunState } from "@/hooks/useRunStream";
import type { AgentId, Unit } from "@/lib/types";

const ROWS = 16;

function Dot({
  agent,
  correct,
  xPct,
  rowIndex,
}: {
  agent: AgentId;
  correct: boolean;
  xPct: number;
  rowIndex: number;
}) {
  const top = 18 + (rowIndex % ROWS) * 13;
  const color = correct ? "var(--color-correct)" : "var(--color-incorrect)";
  return (
    <span
      className="animate-dot-drop absolute flex items-center justify-center"
      style={{ left: `${xPct}%`, top, width: 14, height: 14 }}
      title={`${agent}: ${correct ? "correct" : "wrong"}`}
    >
      {/* shape redundancy: ✓ for correct, ✕ for wrong (not color-only) */}
      {correct ? (
        <Check size={13} strokeWidth={3.5} style={{ color }} />
      ) : (
        <X size={13} strokeWidth={3.5} style={{ color }} />
      )}
    </span>
  );
}

function Lane({
  title,
  subtitle,
  variant,
  agent,
  data,
  truth,
  unit,
}: {
  title: string;
  subtitle: string;
  variant: "a" | "b";
  agent: AgentId;
  data: AgentRunState;
  truth: number | null;
  unit: Unit;
}) {
  const center = truth ?? 0;
  const half = symmetricHalfSpan(center, data.min, data.max);
  const xPct = (v: number) => {
    const frac = Math.max(-1, Math.min(1, (v - center) / half));
    return 50 + frac * 42;
  };

  const distinct = new Set(data.answers.map((a) => Math.round(a * 100))).size;
  const nCorrect = data.runs.filter((r) => r.correct).length;
  const pct = data.runs.length ? Math.round((100 * nCorrect) / data.runs.length) : 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <Badge variant={variant}>{variant === "a" ? "the Guesser" : "the Formula Writer"}</Badge>
      </div>
      <p className="mb-3 mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>

      <div className="relative h-[260px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)]">
        {/* truth reference line (dashed, near-white) */}
        <div
          className="absolute bottom-0 top-0 border-l-2 border-dashed"
          style={{ left: "50%", borderColor: "var(--color-truth)" }}
        >
          <span className="absolute left-1.5 top-1 text-[10px] uppercase tracking-wide text-[var(--color-truth)]">
            right answer
          </span>
        </div>
        {data.runs.map((r, i) =>
          r.answer == null ? null : (
            <Dot
              key={i}
              agent={agent}
              correct={r.correct}
              xPct={xPct(r.answer)}
              rowIndex={r.run_index}
            />
          )
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat k="different answers" v={String(distinct || "—")} />
        <Stat k="got it right" v={data.runs.length ? `${pct}%` : "—"} />
        <Stat
          k="typical answer"
          v={data.answers.length ? formatValue(data.answers[data.answers.length - 1], unit) : "—"}
        />
      </div>
    </Card>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{k}</div>
      <div className="tabular mt-1 text-base font-bold">{v}</div>
    </div>
  );
}

export function ScatterView({ state }: { state: RunState }) {
  return (
    <div>
      <p className="mx-auto mb-4 max-w-3xl text-center text-sm text-[var(--color-muted)]">
        Each mark is one attempt at the <em className="not-italic font-semibold text-[var(--color-text)]">same question</em>.
        The dashed line is the real answer. Watch the Guesser's marks spray around it while the
        Formula Writer's land right on it.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <Lane
          title="Helper A reads the data"
          subtitle="It eyeballs thousands of rows and does the math itself."
          variant="a"
          agent="A"
          data={state.A}
          truth={state.truth}
          unit={state.unit}
        />
        <Lane
          title="Helper B writes a formula"
          subtitle="It writes a formula and lets the computer do the math."
          variant="b"
          agent="B"
          data={state.B}
          truth={state.truth}
          unit={state.unit}
        />
      </div>
    </div>
  );
}
