// AI Determinism Demo — frontend
// Streams run events over SSE and animates each agent's answers onto an axis.

const el = (id) => document.getElementById(id);

const state = {
  truth: null,
  unit: "number",
  // Per-agent collected answers and dynamic axis scaling.
  A: { answers: [], min: null, max: null, dots: [] },
  B: { answers: [], min: null, max: null, dots: [] },
};

// ---- formatting -----------------------------------------------------------

function fmt(value, unit) {
  if (value === null || value === undefined) return "–";
  if (unit === "currency") return "$" + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unit === "ratio") return Number(value).toFixed(2) + "%";
  return Number(value).toLocaleString();
}

// ---- axis + dot placement -------------------------------------------------

// Map an answer value to a horizontal % position within a lane's plot.
// The axis is centered on the truth and scaled to the widest deviation seen,
// so Agent B's identical answers stack exactly on the truth line while
// Agent A's spread fans out across the plot.
function xPercent(agent, value) {
  const s = state[agent];
  const truth = state.truth ?? 0;
  // Half-width of the axis in value units (symmetric around truth).
  let halfSpan = Math.max(
    Math.abs((s.max ?? truth) - truth),
    Math.abs(truth - (s.min ?? truth)),
    Math.abs(truth) * 0.02,  // minimum span so a lone correct dot sits centered
    1e-6
  );
  const frac = (value - truth) / halfSpan; // -1 .. +1 (roughly)
  const clamped = Math.max(-1, Math.min(1, frac));
  return 50 + clamped * 42; // keep within 8%..92%
}

function reflowDots(agent) {
  const s = state[agent];
  for (const d of s.dots) {
    d.elem.style.left = xPercent(agent, d.value) + "%";
  }
}

function addDot(agent, runIndex, value, correct) {
  const plot = el("plot-" + agent.toLowerCase());
  const s = state[agent];

  if (value !== null && value !== undefined) {
    s.answers.push(value);
    s.min = s.min === null ? value : Math.min(s.min, value);
    s.max = s.max === null ? value : Math.max(s.max, value);
  }

  const dot = document.createElement("div");
  dot.className = "dot " + (correct ? "correct" : "wrong");
  // Stagger vertically by run so overlapping dots remain visible.
  const rows = 16;
  const top = 20 + (runIndex % rows) * 13;
  dot.style.top = top + "px";
  dot.style.left = xPercent(agent, value ?? state.truth) + "%";
  dot.title = `run ${runIndex}: ${value}` + (correct ? " ✓" : " ✗");
  plot.appendChild(dot);

  s.dots.push({ elem: dot, value: value ?? state.truth });
  // Rescale existing dots as the observed range grows.
  reflowDots(agent);
}

function placeTruthLine() {
  for (const agent of ["A", "B"]) {
    const line = el("truth-" + agent.toLowerCase());
    line.style.left = "50%"; // truth is always centered
  }
  el("truth-readout").textContent =
    "Ground truth: " + fmt(state.truth, state.unit) + "  (computed directly from the data)";
}

// ---- stats ----------------------------------------------------------------

function updateStats(agent, summary) {
  const box = el("stats-" + agent.toLowerCase());
  const pct = summary.n_runs ? Math.round((100 * summary.n_correct) / summary.n_runs) : 0;
  box.querySelector('[data-f="distinct"]').textContent = summary.distinct_values ?? "–";
  box.querySelector('[data-f="correct"]').textContent = pct + "%";
  box.querySelector('[data-f="mean"]').textContent = fmt(summary.mean, state.unit);
  box.querySelector('[data-f="stdev"]').textContent =
    summary.stdev === null || summary.stdev === undefined ? "–" : Number(summary.stdev).toFixed(2);
}

// ---- reset ----------------------------------------------------------------

function resetPlots() {
  for (const agent of ["A", "B"]) {
    state[agent] = { answers: [], min: null, max: null, dots: [] };
    const plot = el("plot-" + agent.toLowerCase());
    plot.querySelectorAll(".dot").forEach((d) => d.remove());
    const box = el("stats-" + agent.toLowerCase());
    box.querySelectorAll(".v").forEach((v) => (v.textContent = "–"));
  }
  el("verdict").classList.add("hidden");
}

// ---- run ------------------------------------------------------------------

let evtSource = null;

function run() {
  const question = el("question").value;
  const runs = parseInt(el("runs").value, 10) || 20;

  resetPlots();
  state.truth = null;
  const q = QUESTIONS.find((x) => x.id === question);
  state.unit = q ? q.unit : "number";

  el("run-btn").disabled = true;
  el("run-btn").textContent = "Running…";

  if (evtSource) evtSource.close();
  evtSource = new EventSource(`/api/stream?question=${encodeURIComponent(question)}&runs=${runs}`);

  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "truth") {
      state.truth = msg.value;
      state.unit = msg.unit || state.unit;
      placeTruthLine();
    } else if (msg.type === "run") {
      addDot(msg.agent, msg.run_index, msg.answer, msg.correct);
    } else if (msg.type === "summary") {
      updateStats("A", msg.A);
      updateStats("B", msg.B);
      const v = el("verdict");
      v.textContent = msg.verdict;
      v.classList.remove("hidden");
      finish();
    } else if (msg.type === "error") {
      const v = el("verdict");
      v.textContent = "Error: " + msg.message;
      v.classList.remove("hidden");
      finish();
    }
  };

  evtSource.onerror = () => finish();
}

function finish() {
  if (evtSource) { evtSource.close(); evtSource = null; }
  el("run-btn").disabled = false;
  el("run-btn").textContent = "Run comparison";
}

// ---- bootstrap ------------------------------------------------------------

let QUESTIONS = [];

async function init() {
  const [cfg, questions] = await Promise.all([
    fetch("/api/config").then((r) => r.json()),
    fetch("/api/questions").then((r) => r.json()),
  ]);

  QUESTIONS = questions;
  const sel = el("question");
  for (const q of questions) {
    const opt = document.createElement("option");
    opt.value = q.id;
    opt.textContent = `[${q.difficulty}] ${q.prompt}`;
    sel.appendChild(opt);
  }

  el("runs").value = cfg.default_runs;
  el("provider-badge").textContent =
    `provider: ${cfg.provider} · model: ${cfg.model} · A temp: ${cfg.agent_a_temperature}`;

  el("run-btn").addEventListener("click", run);
}

init();
