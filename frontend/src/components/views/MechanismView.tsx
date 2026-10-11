import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Code2 } from "lucide-react";
import { formatValue } from "@/lib/api";
import type { RunState } from "@/hooks/useRunStream";
import type { RunEvent, Unit } from "@/lib/types";

function pairRuns(state: RunState): { index: number; a?: RunEvent; b?: RunEvent }[] {
  const map = new Map<number, { index: number; a?: RunEvent; b?: RunEvent }>();
  for (const r of state.A.runs) map.set(r.run_index, { ...(map.get(r.run_index) ?? { index: r.run_index }), a: r });
  for (const r of state.B.runs) map.set(r.run_index, { ...(map.get(r.run_index) ?? { index: r.run_index }), b: r });
  return [...map.values()].sort((x, y) => x.index - y.index);
}

function Result({ correct, value, unit }: { correct: boolean; value: number | null; unit: Unit }) {
  const color = correct ? "var(--color-correct)" : "var(--color-incorrect)";
  return (
    <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
      {correct ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
      {formatValue(value, unit)}
    </div>
  );
}

export function MechanismView({ state }: { state: RunState }) {
  const [showCode, setShowCode] = useState(false);
  const rows = pairRuns(state);

  return (
    <div>
      <p className="mx-auto mb-3 max-w-3xl text-center text-sm text-[var(--color-muted)]">
        The <em className="not-italic font-semibold text-[var(--color-text)]">why</em>. On the left, the Guesser
        reasons in words and does the math in its head. On the right, the Formula Writer builds a
        formula and lets the computer run it — the same way a careful analyst would.
      </p>
      <div className="mb-4 flex justify-center">
        <Button variant="outline" size="sm" onClick={() => setShowCode((v) => !v)}>
          <Code2 size={14} /> {showCode ? "Hide the code" : "Show me the code"}
        </Button>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-[1fr_1fr] gap-3 px-1 pb-2 text-xs font-semibold text-[var(--color-muted)]">
        <div>Helper A — reasoning in words</div>
        <div>Helper B — the formula it wrote</div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        {rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-[var(--color-muted)]">
            Run a comparison to see each helper's work, side by side.
          </Card>
        )}
        {rows.map((row) => (
          <Card key={row.index} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            <div className="md:col-span-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
              try {row.index + 1}
            </div>
            <div className="text-sm leading-relaxed text-[#d9def2]">
              <div className="whitespace-pre-wrap break-words">
                {row.a?.detail || row.a?.error || "(no output)"}
              </div>
              {row.a && <Result correct={row.a.correct} value={row.a.answer} unit={state.unit} />}
            </div>
            <div>
              {showCode ? (
                <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[#0e1430] p-3 text-xs text-[#a9c7ff]">
                  <code>{row.b?.sql || row.b?.error || "(no formula)"}</code>
                </pre>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="b">
                    <Code2 size={12} /> formula written
                  </Badge>
                  <span className="text-xs text-[var(--color-muted)]">(click "Show me the code")</span>
                </div>
              )}
              {row.b && <Result correct={row.b.correct} value={row.b.answer} unit={state.unit} />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
