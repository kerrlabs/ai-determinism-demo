import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatValue } from "@/lib/api";
import type { RunState } from "@/hooks/useRunStream";
import type { Unit } from "@/lib/types";

const W = 520;
const H = 240;
const BINS = 24;

function Histogram({
  answers,
  truth,
  unit,
  color,
}: {
  answers: number[];
  truth: number | null;
  unit: Unit;
  color: string;
}) {
  if (answers.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-[var(--color-muted)]">
        waiting for answers…
      </div>
    );
  }
  const t = truth ?? 0;
  let lo = Math.min(t, ...answers);
  let hi = Math.max(t, ...answers);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  const binW = (hi - lo) / BINS;
  const counts = new Array(BINS).fill(0);
  for (const v of answers) {
    let idx = Math.floor((v - lo) / binW);
    idx = Math.max(0, Math.min(BINS - 1, idx));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts, 1);
  const padL = 8;
  const padB = 20;
  const padT = 10;
  const plotW = W - padL * 2;
  const plotH = H - padB - padT;
  const tx = padL + ((t - lo) / (hi - lo)) * plotW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Histogram of answers">
      {counts.map((c, i) => {
        const h = (c / maxCount) * plotH;
        const x = padL + (i / BINS) * plotW;
        const w = (plotW / BINS) * 0.86;
        return (
          <rect key={i} x={x} y={padT + plotH - h} width={w} height={h} fill={color} opacity={0.85} rx={1} />
        );
      })}
      <line x1={tx} y1={padT} x2={tx} y2={padT + plotH} stroke="var(--color-truth)" strokeWidth={2} strokeDasharray="4 3" />
      <text x={tx + 4} y={padT + 11} fontSize={10} fill="var(--color-truth)">right answer</text>
      <text x={padL} y={H - 5} fontSize={10} fill="var(--color-muted)">{formatValue(lo, unit)}</text>
      <text x={W - padL} y={H - 5} fontSize={10} fill="var(--color-muted)" textAnchor="end">{formatValue(hi, unit)}</text>
    </svg>
  );
}

export function DistributionView({ state }: { state: RunState }) {
  return (
    <div>
      <p className="mx-auto mb-4 max-w-3xl text-center text-sm text-[var(--color-muted)]">
        The same answers, stacked into a shape. The Guesser spreads into a wide hill of different
        answers; the Formula Writer stacks into a single tall bar on the real answer.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold">Helper A — the Guesser</h3>
            <Badge variant="a">spreads out</Badge>
          </div>
          <Histogram answers={state.A.answers} truth={state.truth} unit={state.unit} color="var(--color-agent-a)" />
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold">Helper B — the Formula Writer</h3>
            <Badge variant="b">one answer</Badge>
          </div>
          <Histogram answers={state.B.answers} truth={state.truth} unit={state.unit} color="var(--color-agent-b)" />
        </Card>
      </div>
    </div>
  );
}
