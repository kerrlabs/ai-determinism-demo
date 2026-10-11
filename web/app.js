// AI Determinism Demo — frontend
// A single SSE run populates five switchable views. No external libraries.

const el = (id) => document.getElementById(id);

const state = {
  truth: null,
  unit: "number",
  formula: "",
  // Per-agent collected data shared across every view.
  A: { answers: [], runs: [], min: null, max: null, dots: [], runningMean: [] },
  B: { answers: [], runs: [], min: null, max: null, dots: [], runningMean: [] },
  summary: null,
};

let QUESTIONS = [];
let evtSource = null;

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
function fmt(value, unit) {
  if (value === null || value === undefined) return "–";
  if (unit === "currency") return "$" + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unit === "ratio") return Number(value).toFixed(2) + "%";
  return Number(value).toLocaleString();
}

// ===========================================================================
// VIEW 1 — SCATTER (existing)
// ===========================================================================
function xPercent(agent, value) {
  const s = state[agent];
  const truth = state.truth ?? 0;
  let halfSpan = Math.max(
    Math.abs((s.max ?? truth) - truth),
    Math.abs(truth - (s.min ?? truth)),
    Math.abs(truth) * 0.02,
    1e-6
  );
  const frac = (value - truth) / halfSpan;
  const clamped = Math.max(-1, Math.min(1, frac));
  return 50 + clamped * 42;
}

function reflowDots(agent) {
  for (const d of state[agent].dots) d.elem.style.left = xPercent(agent, d.value) + "%";
}

function scatterAddDot(agent, runIndex, value, correct) {
  const plot = el("plot-" + agent.toLowerCase());
  const s = state[agent];
  const dot = document.createElement("div");
  dot.className = "dot " + (correct ? "correct" : "wrong");
  const rows = 16;
  dot.style.top = 20 + (runIndex % rows) * 13 + "px";
  dot.style.left = xPercent(agent, value ?? state.truth) + "%";
  dot.title = `run ${runIndex}: ${value}` + (correct ? " ✓" : " ✗");
  plot.appendChild(dot);
  s.dots.push({ elem: dot, value: value ?? state.truth });
  reflowDots(agent);
}

function scatterPlaceTruth() {
  el("truth-a").style.left = "50%";
  el("truth-b").style.left = "50%";
}

function scatterStats(agent, summary) {
  const box = el("stats-" + agent.toLowerCase());
  const pct = summary.n_runs ? Math.round((100 * summary.n_correct) / summary.n_runs) : 0;
  box.querySelector('[data-f="distinct"]').textContent = summary.distinct_values ?? "–";
  box.querySelector('[data-f="correct"]').textContent = pct + "%";
  box.querySelector('[data-f="mean"]').textContent = fmt(summary.mean, state.unit);
  box.querySelector('[data-f="stdev"]').textContent =
    summary.stdev == null ? "–" : Number(summary.stdev).toFixed(2);
}

// ===========================================================================
// VIEW 2 — DISTRIBUTION (histogram, canvas)
// ===========================================================================
function drawHistogram(agent) {
  const canvas = el("hist-" + agent.toLowerCase());
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const data = state[agent].answers;
  if (data.length === 0) return;

  // Bin range: span both answers and truth so the truth marker is on-chart.
  const truth = state.truth ?? 0;
  let lo = Math.min(truth, ...data);
  let hi = Math.max(truth, ...data);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;

  const bins = 24;
  const counts = new Array(bins).fill(0);
  const binW = (hi - lo) / bins;
  for (const v of data) {
    let idx = Math.floor((v - lo) / binW);
    idx = Math.max(0, Math.min(bins - 1, idx));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts, 1);

  const padL = 8, padB = 22, padT = 10;
  const plotW = W - padL * 2, plotH = H - padB - padT;
  const color = agent === "A" ? "#ff5d6c" : "#37d67a";

  // bars
  for (let i = 0; i < bins; i++) {
    const h = (counts[i] / maxCount) * plotH;
    const x = padL + (i / bins) * plotW;
    const w = (plotW / bins) * 0.86;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, padT + plotH - h, w, h);
  }
  ctx.globalAlpha = 1;

  // truth line
  const tx = padL + ((truth - lo) / (hi - lo)) * plotW;
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tx, padT); ctx.lineTo(tx, padT + plotH); ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.font = "11px Segoe UI";
  ctx.fillText("truth", tx + 4, padT + 12);

  // axis labels (lo / hi)
  ctx.fillStyle = "#9aa3c7";
  ctx.font = "10px Segoe UI";
  ctx.fillText(fmt(lo, state.unit), padL, H - 6);
  const hiLabel = fmt(hi, state.unit);
  ctx.fillText(hiLabel, W - padL - ctx.measureText(hiLabel).width, H - 6);
}

// ===========================================================================
// VIEW 3 — CONVERGENCE (running mean line chart, canvas)
// ===========================================================================
function drawConvergence() {
  const canvas = el("conv");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const a = state.A.runningMean, b = state.B.runningMean;
  const n = Math.max(a.length, b.length);
  const truth = state.truth ?? 0;

  const padL = 60, padR = 16, padB = 28, padT = 16;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  // Y range from all means + truth.
  const vals = [...a, ...b, truth].filter((v) => v != null && isFinite(v));
  if (vals.length === 0) return;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;

  const X = (i) => padL + (n <= 1 ? 0.5 : i / (n - 1)) * plotW;
  const Y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

  // axes
  ctx.strokeStyle = "#2a3160"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

  // y labels
  ctx.fillStyle = "#9aa3c7"; ctx.font = "10px Segoe UI";
  for (let k = 0; k <= 4; k++) {
    const v = lo + (k / 4) * (hi - lo);
    const y = Y(v);
    ctx.fillText(fmt(v, state.unit), 4, y + 3);
    ctx.strokeStyle = "#1d2342";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
  }

  // truth line
  ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(padL, Y(truth)); ctx.lineTo(padL + plotW, Y(truth)); ctx.stroke();
  ctx.setLineDash([]);

  const line = (series, color) => {
    if (series.length === 0) return;
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
    series.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // end dot
    const li = series.length - 1;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(li), Y(series[li]), 4, 0, 7); ctx.fill();
  };
  line(a, "#ff5d6c");
  line(b, "#37d67a");

  // x label
  ctx.fillStyle = "#9aa3c7";
  ctx.fillText("run →", padL + plotW - 34, H - 8);
}

// ===========================================================================
// VIEW 4 — MECHANISM (prose vs SQL per run)
// ===========================================================================
const mechPending = {}; // run_index -> {a, b}

function mechConsider(evt) {
  const i = evt.run_index;
  mechPending[i] = mechPending[i] || {};
  mechPending[i][evt.agent] = evt;
  const pair = mechPending[i];
  if (pair.A && pair.B) {
    mechRenderRow(i, pair.A, pair.B);
    delete mechPending[i];
  }
}

function mechRenderRow(i, aEvt, bEvt) {
  const row = document.createElement("div");
  row.className = "mech-row";

  const aText = (aEvt.detail || aEvt.error || "(no output)").trim();
  const aAnswer = aEvt.answer == null ? "—" : fmt(aEvt.answer, state.unit);
  const sql = (bEvt.sql || bEvt.error || "(no SQL)").trim();
  const bAnswer = bEvt.answer == null ? "—" : fmt(bEvt.answer, state.unit);

  row.innerHTML =
    `<div class="mech-run-no">run ${i}</div>` +
    `<div class="mech-cell mech-a">${escapeHtml(aText)}` +
      `<div class="mech-result ${aEvt.correct ? "correct" : "wrong"}">→ ${aAnswer} ${aEvt.correct ? "✓" : "✗"}</div></div>` +
    `<div class="mech-cell"><div class="mech-sql">${escapeHtml(sql)}</div>` +
      `<div class="mech-result ${bEvt.correct ? "correct" : "wrong"}">→ ${bAnswer} ${bEvt.correct ? "✓" : "✗"}</div></div>`;

  el("mech-rows").appendChild(row);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===========================================================================
// VIEW 5 — SCORECARD
// ===========================================================================
function fillScorecard(summary) {
  const table = el("scorecard");
  const set = (agent, field, val) => {
    const cell = table.querySelector(`td[data-c="${agent}"][data-f="${field}"]`);
    if (cell) cell.textContent = val;
  };
  for (const agent of ["A", "B"]) {
    const s = summary[agent];
    const pct = s.n_runs ? Math.round((100 * s.n_correct) / s.n_runs) : 0;
    const det = (s.distinct_values ?? 0) <= 1;
    set(agent, "distinct", s.distinct_values ?? "–");
    set(agent, "correct", pct + "%");
    set(agent, "mean", fmt(s.mean, state.unit));
    set(agent, "stdev", s.stdev == null ? "–" : Number(s.stdev).toFixed(2));
    set(agent, "range", s.min == null ? "–" : `${fmt(s.min, state.unit)} – ${fmt(s.max, state.unit)}`);
    set(agent, "repro", det ? "✓ yes" : "✗ no");
    set(agent, "audit", agent === "B" ? "✓ yes (SQL)" : "✗ no");
  }
  renderCost(summary);
}

function renderCost(summary) {
  const cost = el("cost");
  const truth = summary.truth;
  const a = summary.A;
  // Worst-case Agent A deviation from truth.
  let worst = null, worstDelta = -1;
  for (const v of a.answers) {
    const d = Math.abs(v - truth);
    if (d > worstDelta) { worstDelta = d; worst = v; }
  }
  if (worst == null) { cost.classList.add("hidden"); return; }
  const pctOff = truth !== 0 ? Math.round((worstDelta / Math.abs(truth)) * 100) : 0;
  const q = QUESTIONS.find((x) => x.id === el("question").value);
  const label = q ? q.prompt : "this metric";

  cost.classList.remove("hidden");
  cost.innerHTML =
    `<strong>Cost of being wrong.</strong> Asked "<em>${escapeHtml(label)}</em>", ` +
    `Agent A's worst run reported <strong>${fmt(worst, state.unit)}</strong> ` +
    `vs. the true <strong>${fmt(truth, state.unit)}</strong> — off by <strong>${pctOff}%</strong>. ` +
    `Across ${a.n_runs} runs it gave <strong>${a.distinct_values}</strong> different answers ` +
    `(${Math.round((100 * a.n_correct) / a.n_runs)}% correct). ` +
    `Agent B returned the exact figure every time. If this number drove a financial report, ` +
    `an inventory order, or a dosing calculation, Agent A's variability is the difference between a ` +
    `decision you can defend and one you cannot.`;
}

// ===========================================================================
// VIEW 6 — HUMAN vs AI (teaching frame)
// ===========================================================================
function humanSetFormulaAndTruth() {
  el("hv-formula").textContent = state.formula || "—";
  el("hv-truth").textContent = fmt(state.truth, state.unit);
  // Human analyst always lands on the truth (the tool computes it).
  el("hv-analyst-ans").textContent = state.truth == null ? "—" : fmt(state.truth, state.unit);
}

function humanReset() {
  ["hv-hurry-ans", "hv-ai-a", "hv-ai-b"].forEach((id) => (el(id).textContent = "—"));
  el("hv-analyst-ans").textContent = "—";
  el("hv-ai-a-sub").textContent = "";
  el("hv-ai-b-sub").textContent = "";
}

function fillHumanView(summary) {
  const a = summary.A, b = summary.B;

  // "Human in a hurry" is illustrated by Agent A's own spread: show the range
  // of guesses, which is exactly what a hurried person's mental math looks like.
  if (a.min != null && a.max != null && a.min !== a.max) {
    el("hv-hurry-ans").textContent = `${fmt(a.min, state.unit)} … ${fmt(a.max, state.unit)}`;
  } else if (a.mean != null) {
    el("hv-hurry-ans").textContent = fmt(a.mean, state.unit);
  }

  // AI mirror — Agent A
  el("hv-ai-a").textContent =
    a.distinct_values > 1 ? `${a.distinct_values} different answers` : fmt(a.mean, state.unit);
  const aPct = a.n_runs ? Math.round((100 * a.n_correct) / a.n_runs) : 0;
  el("hv-ai-a-sub").textContent =
    `${a.distinct_values} distinct over ${a.n_runs} runs · ${aPct}% correct`;

  // AI mirror — Agent B
  el("hv-ai-b").textContent = b.mean == null ? "—" : fmt(b.mean, state.unit);
  const bPct = b.n_runs ? Math.round((100 * b.n_correct) / b.n_runs) : 0;
  el("hv-ai-b-sub").textContent =
    `${b.distinct_values} distinct over ${b.n_runs} runs · ${bPct}% correct`;
}

// ===========================================================================
// SHARED: handle each SSE event -> update ALL views
// ===========================================================================
function onTruth(msg) {
  state.truth = msg.value;
  state.unit = msg.unit || state.unit;
  scatterPlaceTruth();
  el("truth-readout").textContent =
    "Ground truth: " + fmt(state.truth, state.unit) + "  (computed directly from the data)";
  drawConvergence();
  drawHistogram("A"); drawHistogram("B");
  humanSetFormulaAndTruth();
}

function onRun(msg) {
  const agent = msg.agent;
  const s = state[agent];
  if (msg.answer != null) {
    s.answers.push(msg.answer);
    s.runs.push(msg.run_index);
    s.min = s.min == null ? msg.answer : Math.min(s.min, msg.answer);
    s.max = s.max == null ? msg.answer : Math.max(s.max, msg.answer);
    const sum = s.answers.reduce((p, c) => p + c, 0);
    s.runningMean.push(sum / s.answers.length);
  } else {
    // keep running mean series aligned on error runs
    s.runningMean.push(s.runningMean.length ? s.runningMean[s.runningMean.length - 1] : (state.truth ?? 0));
  }

  // View 1
  scatterAddDot(agent, msg.run_index, msg.answer, msg.correct);
  // View 2
  drawHistogram(agent);
  // View 3
  drawConvergence();
  // View 4
  mechConsider(msg);
}

function onSummary(msg) {
  state.summary = msg;
  scatterStats("A", msg.A);
  scatterStats("B", msg.B);
  fillScorecard(msg);
  fillHumanView(msg);
  const v = el("verdict");
  v.textContent = msg.verdict;
  v.classList.remove("hidden");
  finish();
}

// ===========================================================================
// run lifecycle
// ===========================================================================
function resetAll() {
  for (const agent of ["A", "B"]) {
    state[agent] = { answers: [], runs: [], min: null, max: null, dots: [], runningMean: [] };
    const plot = el("plot-" + agent.toLowerCase());
    plot.querySelectorAll(".dot").forEach((d) => d.remove());
    el("stats-" + agent.toLowerCase()).querySelectorAll(".v").forEach((v) => (v.textContent = "–"));
  }
  for (const k in mechPending) delete mechPending[k];
  el("mech-rows").innerHTML = "";
  el("cost").classList.add("hidden");
  el("verdict").classList.add("hidden");
  humanReset();
  drawHistogram("A"); drawHistogram("B"); drawConvergence();
}

function run() {
  const question = el("question").value;
  const runs = parseInt(el("runs").value, 10) || 20;
  resetAll();
  state.truth = null;
  const q = QUESTIONS.find((x) => x.id === question);
  state.unit = q ? q.unit : "number";
  state.formula = q ? q.formula : "";

  el("run-btn").disabled = true;
  el("run-btn").textContent = "Running…";

  if (evtSource) evtSource.close();
  evtSource = new EventSource(`/api/stream?question=${encodeURIComponent(question)}&runs=${runs}`);
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "truth") onTruth(msg);
    else if (msg.type === "run") onRun(msg);
    else if (msg.type === "summary") onSummary(msg);
    else if (msg.type === "error") { el("verdict").textContent = "Error: " + msg.message; el("verdict").classList.remove("hidden"); finish(); }
  };
  evtSource.onerror = () => finish();
}

function finish() {
  if (evtSource) { evtSource.close(); evtSource = null; }
  el("run-btn").disabled = false;
  el("run-btn").textContent = "Run comparison";
}

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
      // Canvas needs a redraw when its panel becomes visible (was display:none).
      if (view === "distribution") { drawHistogram("A"); drawHistogram("B"); }
      if (view === "convergence") drawConvergence();
    });
  });
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------
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
  // Show the analyst's formula as soon as a question is chosen (pre-run).
  const syncFormula = () => {
    const q = QUESTIONS.find((x) => x.id === sel.value);
    state.formula = q ? q.formula : "";
    state.unit = q ? q.unit : "number";
    el("hv-formula").textContent = state.formula || "—";
  };
  sel.addEventListener("change", syncFormula);
  syncFormula();
  setupTabs();
}

init();
