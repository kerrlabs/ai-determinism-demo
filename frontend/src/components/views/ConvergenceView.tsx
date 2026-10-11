import { Card } from "@/components/ui/card";
import { formatValue } from "@/lib/api";
import { linearScale } from "@/lib/scale";
import type { RunState } from "@/hooks/useRunStream";

const W = 960;
const H = 340;

export function ConvergenceView({ state }: { state: RunState }) {
  const a = state.A.runningMean;
  const b = state.B.runningMean;
  const n = Math.max(a.length, b.length);
  const truth = state.truth ?? 0;

  const padL = 64;
  const padR = 16;
  const padB = 28;
  const padT = 16;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const vals = [...a, ...b, truth].filter((v) => Number.isFinite(v));
  let lo = vals.length ? Math.min(...vals) : truth - 1;
  let hi = vals.length ? Math.max(...vals) : truth + 1;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const padY = (hi - lo) * 0.12;
  lo -= padY;
  hi += padY;

  const X = (i: number) => padL + (n <= 1 ? 0.5 : i / (n - 1)) * plotW;
  const yScale = linearScale(lo, hi, padT + plotH, padT);
  const Y = (v: number) => yScale(v);

  const path = (series: number[]) =>
    series.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  const yTicks = Array.from({ length: 5 }, (_, k) => lo + (k / 4) * (hi - lo));

  return (
    <div>
      <p className="mx-auto mb-4 max-w-3xl text-center text-sm text-[var(--color-muted)]">
        "Just average several AI answers and it'll be right," people assume. Watch: the Guesser's
        running average wanders and settles on a <em className="not-italic font-semibold text-[var(--color-text)]">wrong</em> number,
        while the Formula Writer is exact from the very first try.
      </p>
      <Card className="mx-auto max-w-5xl p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Running average over runs">
          {yTicks.map((v, k) => (
            <g key={k}>
              <line x1={padL} y1={Y(v)} x2={padL + plotW} y2={Y(v)} stroke="#1d2342" />
              <text x={6} y={Y(v) + 3} fontSize={10} fill="var(--color-muted)">{formatValue(v, state.unit)}</text>
            </g>
          ))}
          {/* truth */}
          <line x1={padL} y1={Y(truth)} x2={padL + plotW} y2={Y(truth)} stroke="var(--color-truth)" strokeWidth={2} strokeDasharray="6 4" />
          {a.length > 0 && <path d={path(a)} fill="none" stroke="var(--color-agent-a)" strokeWidth={2.5} />}
          {b.length > 0 && <path d={path(b)} fill="none" stroke="var(--color-agent-b)" strokeWidth={2.5} />}
          <text x={padL + plotW - 34} y={H - 8} fontSize={10} fill="var(--color-muted)">more tries →</text>
        </svg>
        <div className="mt-3 flex justify-center gap-6 text-xs text-[var(--color-muted)]">
          <Legend color="var(--color-agent-a)" label="Guesser's running average" />
          <Legend color="var(--color-agent-b)" label="Formula Writer's running average" />
          <Legend color="var(--color-truth)" label="right answer" dashed />
        </div>
      </Card>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-[3px] w-4 rounded"
        style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  );
}
