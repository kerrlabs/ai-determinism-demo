import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Play, Loader2, Info } from "lucide-react";
import { fetchConfig, fetchQuestions } from "@/lib/api";
import { useRunStream } from "@/hooks/useRunStream";
import type { AppConfig, Question } from "@/lib/types";
import { ScatterView } from "@/components/views/ScatterView";
import { DistributionView } from "@/components/views/DistributionView";
import { ConvergenceView } from "@/components/views/ConvergenceView";
import { MechanismView } from "@/components/views/MechanismView";
import { HumanVsAiView } from "@/components/views/HumanVsAiView";
import { ScorecardView } from "@/components/views/ScorecardView";

const VIEWS: TabItem[] = [
  { value: "scatter", label: "The Answers" },
  { value: "distribution", label: "The Spread" },
  { value: "convergence", label: "Averaging It" },
  { value: "mechanism", label: "The Why" },
  { value: "human", label: "Human vs AI" },
  { value: "scorecard", label: "Scorecard" },
];

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionId, setQuestionId] = useState<string>("");
  const [runs, setRuns] = useState<number>(20);
  const [view, setView] = useState<string>("scatter");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  const { state, start } = useRunStream(20);

  useEffect(() => {
    Promise.all([fetchConfig(), fetchQuestions()])
      .then(([cfg, qs]) => {
        setConfig(cfg);
        setQuestions(qs);
        setRuns(cfg.default_runs);
        if (qs.length) setQuestionId(qs[0].id);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const question = useMemo(
    () => questions.find((q) => q.id === questionId) ?? null,
    [questions, questionId]
  );

  const running = state.status === "running";
  const progressPct =
    state.requestedRuns > 0 ? (state.completedRuns / state.requestedRuns) * 100 : 0;

  const onRun = () => {
    if (!questionId) return;
    setShowIntro(false);
    start(questionId, runs);
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <h1 className="text-xl font-bold">Couldn't reach the demo backend</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{loadError}</p>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Start the API with <code className="text-[var(--color-accent)]">uvicorn app.server:app --port 8000</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="pt-8 text-center">
        <h1 className="text-2xl font-bold md:text-3xl">
          Two ways to ask an AI the same question
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-[var(--color-muted)]">
          Same question, same data. One helper <strong className="text-[var(--color-text)]">guesses the answer</strong>;
          the other <strong className="text-[var(--color-text)]">writes a formula and lets the computer answer</strong>.
          Only one gives the same result every time.
        </p>
      </header>

      {showIntro && (
        <Card className="mx-auto mt-6 flex max-w-3xl items-start gap-3 border-l-4 border-l-[var(--color-accent)] p-4">
          <Info className="mt-0.5 shrink-0 text-[var(--color-accent)]" size={18} />
          <div className="text-sm leading-relaxed">
            <strong>Pick a question and press Run.</strong> You'll watch each helper answer it {runs} times.
            Helper A reads the raw data and figures it out itself. Helper B writes a formula (like a spreadsheet
            <code className="mx-1 text-[var(--color-accent)]">=SUMIFS(…)</code>) and lets the computer calculate.
            Keep an eye on how often each one lands on the real answer.
          </div>
        </Card>
      )}

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-end justify-center gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          Question
          <Select
            className="min-w-[320px] md:min-w-[460px]"
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
            disabled={running}
          >
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                [{q.difficulty}] {q.prompt}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          Tries
          <input
            type="number"
            min={1}
            max={200}
            value={runs}
            disabled={running}
            onChange={(e) => setRuns(parseInt(e.target.value, 10) || 1)}
            className="h-10 w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-sm"
          />
        </label>
        <Button onClick={onRun} disabled={running || !questionId} size="lg">
          {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
          {running ? "Running…" : "Run comparison"}
        </Button>
        {config && (
          <Badge className="self-center" variant="neutral">
            {config.provider} · {config.model}
          </Badge>
        )}
      </div>

      {/* Progress */}
      {(running || state.status === "done") && (
        <div className="mx-auto mt-4 max-w-xl" aria-live="polite">
          <Progress value={progressPct} />
          <div className="mt-1 text-center text-xs text-[var(--color-muted)]">
            {state.completedRuns} / {state.requestedRuns} tries
            {state.status === "done" && " · done"}
          </div>
        </div>
      )}
      {state.status === "error" && (
        <p className="mt-4 text-center text-sm text-[var(--color-incorrect)]" role="alert">
          {state.error}
        </p>
      )}

      {/* View switcher */}
      <nav className="mt-8">
        <Tabs items={VIEWS} value={view} onValueChange={setView} />
      </nav>

      {/* Active view */}
      <main className="mt-6">
        {view === "scatter" && <ScatterView state={state} />}
        {view === "distribution" && <DistributionView state={state} />}
        {view === "convergence" && <ConvergenceView state={state} />}
        {view === "mechanism" && <MechanismView state={state} />}
        {view === "human" && <HumanVsAiView state={state} question={question} />}
        {view === "scorecard" && <ScorecardView state={state} question={question} />}
      </main>

      {state.summary && (
        <Card className="mx-auto mt-8 max-w-3xl border-l-4 border-l-[var(--color-accent)] p-4 text-sm leading-relaxed">
          {state.summary.verdict}
        </Card>
      )}

      <footer className="mt-10 text-center text-xs text-[var(--color-muted)]">
        The human columns are illustrative; the AI results are real.
      </footer>
    </div>
  );
}
