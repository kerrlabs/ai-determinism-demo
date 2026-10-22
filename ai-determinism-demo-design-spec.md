# AI Determinism Demo — UX & Design Brief (Sections 1–3)

> Scope of this document: **Narrative/story arc, UX flow, and the visual design system.**
> Component architecture, SSE typing, FastAPI integration, and the build plan (sections 4–6) are covered by a separate brief. Where this document touches those areas, it does so only to the extent needed to make the UX land.
>
> **North star:** A person who has never written a line of code — but who knows what an Excel formula is — should leave this demo able to explain, in their own words, *why asking an AI to "just read the data and tell me the answer" is risky, and why asking it to "write the formula and let the computer run it" is trustworthy.* They should feel the difference before they understand it.

---

## 0. The one-sentence thesis (say this out loud)

**"Ask an AI to eyeball the numbers and it guesses differently every time. Ask it to write the formula and let the spreadsheet do the math, and you get the same right answer every time."**

Everything below is in service of making a non-technical viewer *feel* that sentence, then *understand* it, then *trust* it.

We never say "non-deterministic" to the audience. Internally we call the two behaviors:
- **Agent A = "The Guesser"** (AI doing mental math on raw data)
- **Agent B = "The Formula Writer"** (AI writing a formula a deterministic engine runs)

---

# 1. Narrative / Story Arc

## 1.1 The emotional shape of the demo

The demo is a **three-act structure**. The whole point is to withhold the mechanism until *after* the viewer has felt the problem. Lead with intuition, reveal mechanism second, never lead with jargon.

```
ACT 1 — THE HOOK ("something's wrong")
   Same question. Same data. Two helpers.
   One gives a different answer every time. One gives the same answer every time.
          │
          ▼
ACT 2 — THE PROOF ("it's not a fluke")
   Watch it happen 20 times. The guesser scatters. The formula-writer lands.
   The guesser's "average" slowly wanders; the formula-writer was right from run #1.
          │
          ▼
ACT 3 — THE REVEAL ("here's why — and why you already knew this")
   Pull back the curtain: the guesser was doing mental math; the formula-writer
   wrote a formula. You've seen this before — it's the colleague who estimates in
   their head vs. the colleague who types "=SUMIF(...)". Then: so what? What does
   being wrong cost?
```

The "aha" is engineered to arrive **at the end of Act 2**, when the viewer sees the scatter cloud for Agent A sitting *next to* the single tight dot for Agent B, both measured against the same truth line. The reveal in Act 3 is the satisfying *explanation* of a feeling they already have.

## 1.2 View inventory → narrative role

The existing app has six views. We keep all six, but we **re-order, re-label, and re-group** them so they map onto the three acts. We also demote two of them from "tabs you pick" to "moments you're walked through."

| Act | View (internal) | Audience-facing name | What it contributes to the story | Default? |
|-----|-----------------|----------------------|----------------------------------|----------|
| 1 | Scatter | **"The Answers"** | The hook. Dots land on a number line against the truth. Agent A sprays; Agent B stacks. This is the single most important screen. | ✅ **DEFAULT / landing view** |
| 2 | Convergence | **"Does it settle down?"** | Running average over runs. A's average wobbles and chases; B's is a flat line on truth from run 1. Kills the "just average the guesses" objection. | — |
| 2 | Distribution | **"The spread"** | Histogram. Reinforces scatter for people who read bar charts more easily than dot plots. Optional / secondary. | — |
| 3 | Mechanism | **"Show me what each one did"** | THE REVEAL. A's prose reasoning vs B's generated query/formula. Progressive disclosure — hidden until asked for. | — |
| 3 | Human vs AI | **"You've seen this before"** | The analogy bridge. Human-in-a-hurry (mental math) vs human analyst (spreadsheet formula) vs the AI mirror. Makes it relatable, not technical. | — |
| 3 | Scorecard | **"So what? The cost of a wrong number."** | The payoff. Verdict + cost-of-being-wrong. Turns a curiosity into a business/life stake. | — (closing view) |

### Recommended view order (left-to-right in the tab/stepper)
```
The Answers → Does it settle down? → The spread → Show me what each did → You've seen this before → So what?
   (hook)         (proof)             (proof+)        (reveal)              (analogy)            (payoff)
```

**Default landing view: "The Answers" (Scatter).** Justification: it's the fastest path to the emotional payload. A viewer who glances at the screen for three seconds should already sense "one side is messy, one side is clean" before reading a single word.

### Two presentation modes (critical design decision)

Because tabs let a presenter jump around and *skip the build-up*, we offer a **"Guided" vs "Explore" toggle**:

- **Guided mode (default on first load):** a horizontal **stepper** walks through the six views in order with a persistent "Next ▸" button and a one-line narrator caption per step. This is for live presentation and first-time self-serve viewers. It enforces the intuition-before-mechanism arc.
- **Explore mode:** the same views become freely clickable **tabs**. For repeat viewers, skeptics who want to poke, and Q&A.

A single toggle in the header switches between them; the underlying run data is shared, so switching never re-runs anything.

## 1.3 The onboarding / intro moment

Before any data is on screen, show a **one-card intro overlay** (dismissible, remembered via `localStorage` so repeat visitors skip it). It sets the frame in plain language and makes a *prediction the viewer will want to test*.

**Intro card copy (verbatim, use this):**

> ### Two AI helpers. One question. One set of data.
>
> We're going to ask the same question — about the same spreadsheet of data — **twenty times.**
>
> **Helper A** reads the data and tells you the answer, like a smart colleague answering off the top of their head.
>
> **Helper B** doesn't answer directly. It writes the *formula* — then lets the computer do the math, like typing `=SUMIFS(...)` into a spreadsheet.
>
> Same question. Same data. **Will they agree? Will they stay the same if we ask again?**
>
> Hit **Run it** and watch.
>
> `[ Run it ▸ ]`   `[ What am I looking at? ]`

Design notes:
- The intro **does not** explain the conclusion. It plants a question ("Will they stay the same?") the demo then answers. Curiosity gap = retention.
- `What am I looking at?` opens a slightly longer "How to read this" help sheet (see §2.6) rather than cluttering the intro.
- Never show the words "deterministic," "temperature," "LLM," or "SQL" on this card.

## 1.4 Narrator captions (per-view microcopy)

Each view carries a single **narrator line** at the top (big, friendly) and an optional **"why this matters" subline** (smaller, muted). These are the plain-language labels that replace jargon. Use these as written; they are tuned for a non-technical ear.

**The Answers (Scatter) — landing**
- Narrator: **"Each dot is one answer. The dotted line is the real, correct number."**
- Subline: *"Helper A's dots are scattered — it answered differently almost every time. Helper B's dots land on top of each other, right on the line."*
- Live annotation that appears after the run completes: *"Helper A gave {distinct_values} different answers. Helper B gave 1."*

**Does it settle down? (Convergence)**
- Narrator: **"What if we just average Helper A's guesses — does it eventually get the right number?"**
- Subline: *"Watch the running average. Helper A's keeps drifting and never quite settles. Helper B was exactly right from the very first run."*

**The spread (Distribution)**
- Narrator: **"Here's the same thing as a bar chart: how often each answer came up."**
- Subline: *"A tall single bar means 'the same answer every time.' Lots of short bars means 'all over the place.'"*

**Show me what each did (Mechanism)**
- Narrator: **"Why did they behave so differently? Here's exactly what each helper did on each run."**
- Subline (A side): *"Helper A reasoned it out in words — basically mental math. Small slips add up."*
- Subline (B side): *"Helper B wrote a formula and handed it to the computer. The computer runs a formula the same way every single time."*
- Progressive-disclosure control: a **"Show me the formula ▸"** toggle (see §2.4). The formula is shown as a spreadsheet-style formula first, with the raw query behind a secondary "the technical version" expander.

**You've seen this before (Human vs AI)**
- Narrator: **"This isn't an AI quirk — it's a human one too."**
- Column 1 header: **"Person in a hurry"** — *"Does the math in their head. Close, but a little different each time."*
- Column 2 header: **"Careful analyst"** — *"Types a formula into the spreadsheet. Same answer, every time."*
- Column 3 header: **"The AI, doing each job"** — *"Helper A acts like the person in a hurry. Helper B acts like the analyst."*
- Subline: *"The lesson is old. The tool is new."*

**So what? (Scorecard)**
- Narrator: **"If this were a real decision, how much would a wrong number cost?"**
- Subline: *"Helper A was right {A.n_correct} out of {A.n_runs} times. Helper B was right {B.n_correct} out of {B.n_runs}."*
- Verdict chip uses the backend `verdict` string, but we front it with a plain banner: e.g. **"Write the formula. Don't guess."**

## 1.5 Microcopy principles (apply everywhere)

1. **Verbs over nouns.** "It guesses" not "the output is stochastic."
2. **Second person, warm.** "Watch what happens." "You've seen this before."
3. **Numbers in sentences, not labels.** "20 different answers" beats "distinct_values: 20."
4. **The spreadsheet is the anchor metaphor.** Any time we need to explain B, reach for "=SUMIFS" / "pivot table," never "query."
5. **Jargon is opt-in, never default.** The words SQL / temperature / model / deterministic live *only* behind a "the technical version" expander and in a footer "Under the hood" line showing `{provider} · {model}` for credibility.
6. **One idea per screen.** Each view answers exactly one question posed in plain English in its narrator line.

---

# 2. UX Flow

## 2.1 Screen anatomy (persistent chrome)

```
┌───────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                  │
│  AI Determinism Demo        [Guided ⇆ Explore]      [Under the hood ⌄] │
├───────────────────────────────────────────────────────────────────────┤
│ CONTROL BAR                                                             │
│  Question: [ Select ▾ ]   Runs: [ 20 ▾ ]        [ ▶ Run it ]  [↻ Reset]│
│  (difficulty badge)        prompt shown as plain text below select      │
├───────────────────────────────────────────────────────────────────────┤
│ NARRATOR LINE  (big)                                                    │
│ subline (muted)                                                         │
├───────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                      ACTIVE VIEW (chart / panels)                       │
│                                                                         │
├───────────────────────────────────────────────────────────────────────┤
│ GUIDED: [◂ Back]  ● ○ ○ ○ ○ ○  [Next ▸]        EXPLORE: [tab tab tab…] │
├───────────────────────────────────────────────────────────────────────┤
│ FOOTER: live run status · {provider} · {model}  (muted, small)         │
└───────────────────────────────────────────────────────────────────────┘
```

The control bar and header are **always present and never move**, so the viewer can re-run with a different question at any point without hunting.

## 2.2 Controls

| Control | shadcn component | Behavior | Non-technical copy |
|---------|------------------|----------|--------------------|
| Question picker | `Select` | Loads from `GET /api/questions`. On select, show the `prompt` as a plain sentence under the control; show `difficulty` as a `Badge`. Do **not** show the raw `formula` here. | Label: **"Pick a question"** |
| Runs | `Select` (presets 5 / 10 / 20 / 50) default from `config.default_runs` | How many times to ask. Keep it a small preset list; a free number input invites confusion. | Label: **"How many times should we ask?"** |
| Run | `Button` (primary) | Opens the SSE stream `GET /api/stream?question=&runs=`. Disabled while a run is in flight; becomes a `Stop` affordance during streaming. | **"Run it"** → during run: **"Asking… (12/20)"** |
| Reset | `Button` (ghost) | Clears current run state, returns to pre-run empty state, keeps the selected question. | **"Start over"** |
| Mode toggle | `Tabs` or segmented control | Guided ⇆ Explore. | — |
| Under the hood | `Collapsible`/`Popover` | Reveals provider, model, and both agents' temperatures. Credibility, not primary content. | **"Under the hood"** |

**Design decision — defaults:** On first load, pre-select the **first "easy" difficulty question** and `config.default_runs`. The viewer should be able to get to the payoff with a single click of **Run it**. Minimize decisions before the aha.

## 2.3 How a run is initiated and streamed (UX, not code)

1. **Click "Run it."** Immediately:
   - Button → busy state with a live counter.
   - A `Progress` bar appears under the control bar (indeterminate until `truth` arrives, then determinate against total expected runs = `runs × 2` agents).
   - The truth line animates in **first** (we get the `truth` event before `run` events) — this is deliberate: establish "here is the correct answer" before any guesses land, so every dot that follows is read *relative to truth*.
2. **Dots stream in live.** Each `run` event drops one dot onto the Scatter view with a short entrance animation (see §3.6). A-dots and B-dots are visually distinct (shape + color + position band). This live arrival is a big part of the drama — do not batch; render each event as it arrives.
3. **Completion.** On the `summary` event:
   - Progress bar completes and fades.
   - Live annotations resolve ("Helper A gave N different answers; Helper B gave 1").
   - In Guided mode, the **"Next ▸"** button pulses once to invite progression.
4. **Interruptions.** If the user clicks **Stop**, close the stream; keep whatever dots arrived; show "Stopped after X runs" and still allow moving through views with partial data.

### A subtle but important choreography note
Even though the backend may interleave A and B run events arbitrarily, the viewer should perceive **"both helpers answering together."** Render both agents' bands simultaneously in the same Scatter so the contrast builds in real time. Do **not** show A fully, then B — the side-by-side arrival *is* the hook.

## 2.4 Progressive disclosure of technical detail

Three nested levels. The viewer chooses how deep to go.

```
Level 0 (always visible):   Plain-language narration + the dot/line visuals. No code, no jargon.
Level 1 ("Show me what each did"):  The Mechanism view. A = prose reasoning; B = a spreadsheet-style formula.
                                     Still friendly — the formula is shown in Excel syntax when available
                                     (questions carry an Excel-style `formula` string — use it here!).
Level 2 ("The technical version"):  Expander inside Mechanism revealing the raw query/SQL (`run.sql`) and
                                     the error/detail fields. This is where the word "SQL" is allowed to appear,
                                     and only here.
```

Key insight: **the questions already carry an Excel-style `formula` string.** Use that as the Level-1 reveal for Agent B — it's the perfect bridge for a spreadsheet-literate audience ("B basically wrote *this* formula"). The actual generated `run.sql` is Level 2. This lets us honor "SQL is NOT a safe assumption" while still being honest about the mechanism.

**"Show me the code" reveal (Mechanism view):**
- Button copy: **"Show me the formula ▸"** (not "show SQL").
- When expanded, B's panel shows the Excel formula prominently, with a muted secondary link: **"See the technical version (SQL)"** → opens Level 2.
- A's panel shows its prose `detail`/reasoning. If A produced an `error`, show it in plain terms: *"Helper A got confused here and gave no usable answer."*

## 2.5 Loading / empty / error states

| State | Trigger | What the viewer sees | Copy |
|-------|---------|----------------------|------|
| **Initial empty** | Before first run | Ghosted chart frame with the truth line placeholder and a soft arrow pointing at the **Run it** button. | *"Pick a question and hit Run it to watch the two helpers go."* |
| **Config loading** | `GET /api/config` in flight | Skeleton on the control bar only; rest of UI frame visible. | — (skeleton, no text) |
| **Questions loading** | `GET /api/questions` in flight | Question `Select` shows a spinner + "Loading questions…" | *"Loading questions…"* |
| **Streaming** | SSE open, events arriving | Progress bar + live counter + dots animating in. | *"Asking Helper A and Helper B… (12/20)"* |
| **Partial / stalled** | No event for >8s mid-stream | Non-blocking inline notice; keep rendered dots. | *"This is taking longer than usual — still waiting on the next answer…"* |
| **Stream error** | SSE connection drops / server error | `Alert` (destructive, but see color note) with retry. Keep any partial data. | *"Something interrupted the run. [Try again]"* |
| **Config/questions fetch error** | Network/5xx | Full-view `Alert` with retry; disable Run. | *"Couldn't reach the demo server. [Retry]"* |
| **Empty result** | Run completes with 0 usable answers (edge) | Explain gracefully. | *"No answers came back this time. Try running it again."* |

**Principle:** errors are explained in human terms, never a raw stack trace or status code in the primary surface. (A tiny "details" expander may carry the technical error for a presenter debugging live.)

## 2.6 "How to read this" help sheet

Opened from the intro's "What am I looking at?" and from a persistent **(?)** in the header. A `Sheet` (side drawer) or `Dialog` with a tiny legend:

- A labeled mini-diagram of the Scatter: "dot = one answer," "dotted line = the correct number," "Helper A = ●▲ caution color," "Helper B = ■ trustworthy color."
- One line each on the three acts.
- Keyboard shortcuts for presenters (see §2.8).

## 2.7 Accessibility

This is non-negotiable because the demo **relies on a green/right vs red/wrong signal** that fails for ~8% of men. We do not encode meaning in color alone.

### Color-blind safety
- **Correctness is encoded redundantly:** color **+ icon** (✓ / ✕) **+ text** ("right"/"off"). Never color alone.
- **Agent identity is encoded redundantly:** color **+ shape** (A = circle, B = square) **+ position band** (A dots in an upper band, B dots in a lower band of the Scatter) **+ label.** A viewer with full color vision reads it instantly; a color-blind viewer reads it from shape and band.
- **Palette is chosen from a color-blind-safe set** (Okabe–Ito-derived; see §3.3). We deliberately avoid the classic red/green pairing for A/B. Instead: **A = amber/orange ("caution"), B = teal/blue ("trustworthy"), truth = neutral graphite/white dashed reference.** For the correctness ✓/✕ tick we use **blue-leaning teal for correct and vermilion for incorrect** (both distinguishable in deuteranopia and protanopia), always paired with the icon.

### Motion
- Respect `prefers-reduced-motion`. When set: dots **appear** rather than fly/scatter; the convergence line **draws instantly** to final state instead of animating; progress remains but no pulsing. The *information* is identical; only the motion differs.
- Provide a manual **"Reduce motion"** toggle in the header for presenters whose OS setting isn't configured (projectors, kiosk machines).

### Other
- **Keyboard:** every control reachable by Tab; the stepper Back/Next mapped to ← / →; **Space** = Run/Stop. Visible focus rings (shadcn default, don't suppress).
- **Screen readers:** charts get an `aria-label` summary that updates on completion, e.g. *"Scatter chart. Helper A produced 17 distinct answers ranging X to Y; Helper B produced 1 answer equal to the correct value Z."* Each `run` event also announces politely via an `aria-live="polite"` region, throttled (don't announce all 40 — announce the summary).
- **Text contrast:** all body text ≥ 4.5:1, large text ≥ 3:1 against the dark background. Verify the amber/teal on dark meet 3:1 for graphical objects (WCAG 1.4.11).
- **Don't rely on hover:** Tooltips also open on focus/tap; any info in a tooltip is available another way (dots have accessible labels).

## 2.8 Responsive & projector-friendly layout

The demo will be shown live on projectors and shared screens, often from the back of a room.

- **Breakpoints:**
  - `< 640px` (phone): single column, stepper collapses to Back/Next + dots only, control bar stacks, chart gets full width and reduced dot size.
  - `640–1024px` (tablet/laptop): current anatomy.
  - `≥ 1280px` (presentation): generous whitespace, larger type, chart dominates.
- **Presentation / "Big screen" mode** (toggle in header, or auto when width ≥ 1536px): bumps the base font scale up ~25%, thickens the truth line and dot radius, increases narrator line to display size, hides secondary chrome (footer provider line shrinks). The goal: readable from 10 meters.
- **Projector contrast caveat:** projectors crush dark tones and wash out saturation. For this reason the dark theme uses an **elevated near-black (#0F1420), not pure #000**, and the A/B colors are chosen bright enough to survive projection (see §3). Offer a **"High-contrast"** variant that thickens strokes and boosts the truth line to pure white.
- **No horizontal scroll ever.** Charts reflow; tabs become a scrollable row only as a last resort on the narrowest phones.

---

# 3. Visual Design System (Tailwind + shadcn/ui)

## 3.1 Design intent

Calm, editorial, confidence-inspiring. This is a *teaching instrument*, not a dashboard. Lots of negative space, one hero visual per screen, restrained color used **meaningfully** (color = information here, so decorative color is minimized). Dark-first because it reads well on projectors and makes the colored dots pop.

## 3.2 shadcn/ui component map

| UI need | shadcn component | Notes |
|---------|------------------|-------|
| Guided stepper / Explore tabs | `Tabs` (styled as stepper in Guided) | One source of truth for the active view. |
| Question & Runs pickers | `Select` | — |
| Run / Stop / Reset | `Button` (variants: default, destructive-less "stop", ghost) | — |
| Difficulty, verdict, "right/off" chips | `Badge` | Correctness badge carries icon + text, not just color. |
| Progress during stream | `Progress` | Indeterminate → determinate. |
| Dot hover/focus info, legend hints | `Tooltip` | Also opens on focus. |
| Intro, help sheet | `Dialog` (intro) + `Sheet` (help drawer) | Intro remembered via localStorage. |
| "Show me the formula / technical version" | `Collapsible` + `Accordion` | Progressive disclosure levels. |
| Error / stalled notices | `Alert` | Human copy; technical detail behind expander. |
| Under-the-hood provider/model | `Popover` or `HoverCard` | Credibility, muted. |
| Mechanism side-by-side panels | `Card` ×2 (A, B) | Shape/color-coded headers. |
| Scorecard table | `Table` + summary `Card`s | Verdict banner above. |
| Mode / motion / contrast toggles | `Toggle` / `Switch` | Header utilities. |
| Loading | `Skeleton` | Control bar + chart frame. |

Keep to this set. It's deliberately small — every one ships with shadcn and needs no extra dependency.

## 3.3 Color tokens (color-blind safe)

Built on the **Okabe–Ito** palette (designed for all common color-vision deficiencies), tuned for a dark, projector-friendly background. The semantic mapping is the important part:

| Token | Role | Hex | Rationale |
|-------|------|-----|-----------|
| `--truth` | The correct answer / reference line | **`#E8EAED`** (near-white) on dark; dashed | Neutral, authoritative, not "a side." Reads as "the standard everything is measured against." On the light/high-contrast variant, truth becomes `#111827`. |
| `--agent-a` | Helper A — **the Guesser / caution** | **`#E69F00`** (Okabe–Ito orange) | Amber = "careful, this wanders." Warm, slightly anxious. Distinct from both truth and B in all CVD types. |
| `--agent-a-soft` | A fills / low-emphasis | `#E69F00` @ 30–40% alpha | For histogram bars, cloud shading. |
| `--agent-b` | Helper B — **the Formula Writer / trustworthy** | **`#009E8E`** (Okabe–Ito bluish-green/teal) | Teal = calm, reliable, "locked in." Clearly separable from amber for protan/deutan viewers. |
| `--agent-b-soft` | B fills | `#009E8E` @ 30–40% alpha | — |
| `--correct` | ✓ right (used *with* icon+text) | **`#56B4E9`** (Okabe–Ito sky blue) | We deliberately **avoid green for "correct"** so it never clashes/merges with teal-B and never relies on the red/green axis. Blue + ✓ icon. |
| `--incorrect` | ✕ off (used *with* icon+text) | **`#D55E00`** (Okabe–Ito vermilion) | Distinguishable from amber-A by being redder/darker; always paired with ✕ and the word "off." |
| `--bg` | App background (dark) | **`#0F1420`** | Elevated near-black; survives projector gamma, avoids pure-black smearing. |
| `--surface` | Cards / panels | `#161C2B` | — |
| `--surface-2` | Nested / inputs | `#1E2638` | — |
| `--border` | Hairlines | `#2A3346` | — |
| `--text` | Primary text | `#E8EAED` | ≥ 7:1 on `--bg`. |
| `--text-muted` | Sublines, footnotes | `#9BA6B8` | ≥ 4.5:1. |
| `--accent` | Primary button, focus | `#56B4E9` | Matches "correct" blue; neutral vs A/B so the CTA isn't mistaken for a side. |

**Why these specific choices:**
- **A ≠ "red," B ≠ "green."** The naive instinct is red=bad(A), green=good(B). We reject it: it fails color blindness and it *pre-judges* the answer with color before the viewer has formed their own conclusion. Amber-vs-teal lets the *behavior* (scatter vs stack), not the color, deliver the verdict.
- **Truth is neutral/white, not a third hue.** It must read as "the ruler," not "team three."
- **Correct/incorrect ticks use blue/vermilion**, a CVD-safe pair, and are *always* redundant with icon + word.

**Verify at build:** run the final A/B/truth combos through a deuteranopia + protanopia simulator; confirm graphical-object contrast ≥ 3:1 on `--bg`.

### Tailwind token wiring (illustrative, not code to ship as-is)
```css
/* globals.css — CSS variables; map into tailwind theme via @theme or tailwind.config */
:root[data-theme="dark"] {
  --bg: #0F1420;        --surface: #161C2B;   --surface-2: #1E2638;
  --border: #2A3346;    --text: #E8EAED;      --text-muted: #9BA6B8;
  --truth: #E8EAED;     --agent-a: #E69F00;   --agent-b: #009E8E;
  --correct: #56B4E9;   --incorrect: #D55E00; --accent: #56B4E9;
}
:root[data-theme="light"] { /* high-contrast / handout variant */
  --bg: #FFFFFF; --surface:#F4F6FA; --truth:#111827;
  --agent-a:#B5700B; --agent-b:#00766B; --correct:#1E6FB8; --incorrect:#B4480A;
  /* darker tints to keep ≥4.5:1 on white */
}
```

## 3.4 Typography scale

A two-family system: a humanist sans for everything the audience reads, and a mono **only** inside the Level-2 technical reveal (formulas/SQL), so code *looks* like code and prose *looks* approachable.

- **UI/body:** `Inter` (or system `ui-sans-serif`) — neutral, legible at distance.
- **Numerals in charts/scorecard:** enable `font-feature-settings: "tnum"` (tabular figures) so numbers align and don't jitter as they update live.
- **Mono (Level 2 only):** `JetBrains Mono` / `ui-monospace`.

| Role | Size (default → presentation) | Weight | Notes |
|------|-------------------------------|--------|-------|
| Narrator line | 1.5rem → 2.25rem | 600 | The plain-English question for the current view. |
| Subline | 1rem → 1.25rem | 400, `--text-muted` | — |
| Section/card title | 1.125rem | 600 | — |
| Body | 1rem | 400 | ≥16px floor. |
| Chart axis / labels | 0.875rem | 500, tnum | — |
| Big number (scorecard) | 2.5rem → 3.5rem | 700, tnum | "17 of 20" etc. |
| Caption / footnote / provider | 0.8125rem | 400, muted | — |
| Formula (Level 1) | 1rem mono-ish or `tnum` sans | 500 | Excel formula, friendly. |
| SQL (Level 2) | 0.875rem mono | 400 | Only place mono appears. |

Line length capped ~70ch for any prose block. Narrator lines are short enough to never wrap on presentation screens.

## 3.5 Spacing, radius, elevation

- Base spacing unit 4px; generous section padding (24–40px) to keep the single-hero-per-screen feel.
- Radius: `--radius: 0.75rem` (cards), inputs `0.5rem`, dots are circles/squares (A/B shapes).
- Elevation: flat with hairline `--border`; one soft shadow level for the active card only. Avoid heavy shadows (they muddy on projectors).

## 3.6 Animation — the "scatter vs converge" emotional core

This is the heart of the design. The recommendation is **opinionated**:

### Recommendation: **CSS/SVG transitions + a tiny spring helper, no heavy animation lib.**
- For dot entrance and the convergence line, use **native CSS transitions / Web Animations API** driven by React state as `run` events arrive. This is dependency-light and perfectly smooth for ≤100 elements.
- If a spring feel is wanted for the dots, add **`motion` (Framer Motion's `motion/react`)** *only if* the team is comfortable with one extra dependency; it gives `layout` animations and `AnimatePresence` almost for free and respects reduced-motion. **Default recommendation: start library-free; adopt `motion` only if the hand-rolled version feels stiff.** Justify by scope — this app animates a few dozen dots and one line, which CSS handles natively.

**Do NOT** reach for D3's transition engine or a charting lib's built-in animation for the hero beat — you want *art-directed* control over this specific moment, and those abstractions fight you.

### The choreography (the beat that earns the "aha")

1. **Truth lands first.** When the `truth` event arrives, the dashed reference line **draws in** left-to-right (SVG `stroke-dashoffset` transition, ~500ms). The viewer now has a frame of reference. Caption fades in: *"Here's the correct answer."*
2. **Dots arrive live, as a scatter.** Each `run` event spawns a dot that **drops from the top of its agent band** and settles at its answer-x with a slight overshoot/settle (spring-ish, ~350ms). A-dots (circles, amber) rain into the **upper band** across a wide x-range; B-dots (squares, teal) drop into the **lower band** and *stack on the same x* (on truth). The visual asymmetry — A spreading wide, B piling up on the line — **is the message.** No words needed yet.
3. **The contrast "snaps" on completion.** When `summary` arrives:
   - A faint amber **cloud/hull** fades in around A's dots to emphasize spread; a teal **tight ring** pulses once around B's stack to emphasize precision.
   - Two call-out labels fade in: *"≈ {A.distinct_values} different answers"* over the A cloud, *"1 answer, dead on"* over the B stack.
4. **Convergence view = the kill shot.** When the viewer advances to "Does it settle down?", the running-average lines **draw in run-by-run** (left to right): A's line **wiggles and chases** the truth line but never sits on it; B's line is **flat on truth from run 1.** Draw A slightly *after* B (B snaps instantly, A animates its wandering) so the eye reads "B was never in doubt."

### Reduced-motion fallback (must-have)
- `prefers-reduced-motion: reduce` (or the manual toggle): **no drop/overshoot/draw-in.** Dots and lines appear at final positions with a simple 120ms opacity fade. Call-out labels appear immediately. The *information and layout are identical*; only kinetic motion is removed. The scatter-vs-stack contrast still lands because it's spatial, not motion-dependent.

### Performance guardrails
- Cap animated elements; for runs > 50, batch dot entrance (e.g., animate in groups) to avoid jank.
- Use `transform`/`opacity` only (GPU-friendly); never animate layout-triggering properties.
- Pause/stop animations when the tab is hidden.

## 3.7 Dark theme (default) & variants

- **Default: dark** (`--bg #0F1420`). Chosen for projector legibility and because the A/B colored dots sing on dark.
- **High-contrast variant:** thickens truth line to pure white, bumps A/B saturation, increases dot radius and stroke weight — for bad projectors / large rooms.
- **Light "handout" variant:** for screenshots/printouts in slide decks; uses the darker A/B tints from §3.3 to hold contrast on white. Not the primary experience.
- All three driven by `data-theme` on `:root` + the CSS variables above, so swapping is one attribute.

## 3.8 Iconography

- Correctness: ✓ (check) and ✕ (x) from `lucide-react` (ships with shadcn), always beside the word.
- Agent shapes in-chart: circle (A) vs square (B) — rendered in SVG, not icon font, so they scale cleanly.
- Reveal affordances: a right-chevron `▸` that rotates on expand.
- Keep icons sparse; this is a prose-and-data interface, not an icon-heavy app.

---

## Appendix A — Cross-cutting risks & tradeoffs (for sections 1–3)

- **Risk: color meaning vs. no-pre-judgment.** Using amber for A reads faintly "caution," which nudges the viewer. Tradeoff accepted: it's CVD-safe and the *behavior* still does the convincing. We avoid the stronger red=bad framing precisely to not over-steer.
- **Risk: live-streamed dots can feel chaotic / janky.** Mitigation: strict transform/opacity animation, element caps, reduced-motion path, and batching for high run counts.
- **Risk: Guided mode can feel patronizing to technical viewers.** Mitigation: the Explore toggle is one click away and persists.
- **Risk: "Show me the formula" using the question's Excel `formula` may not exactly equal B's generated SQL.** Honesty mitigation: label Level 1 as *"the same idea as this spreadsheet formula"* and keep the actual generated `run.sql` available at Level 2 — don't claim they're literally identical.
- **Risk: projector color crush.** Mitigation: elevated near-black bg, bright CVD-safe hues, high-contrast variant.
- **Tradeoff: library-free animation = more hand-written code** but far fewer deps and full control over the one beat that matters. Recommended given the small element count.

## Appendix B — Copy deck (quick reference for implementers)

- App title: **AI Determinism Demo** (keep, but subtitle it: *"Why asking an AI to 'just tell me the number' is riskier than asking it to show its work."*)
- CTA: **Run it** → **Asking… (n/N)** → **Run again**
- Agent A everywhere user-facing: **Helper A — the one who answers off the top of its head**
- Agent B everywhere user-facing: **Helper B — the one who writes the formula**
- Truth: **the correct answer** (never "ground truth")
- Verdict banner (default): **Write the formula. Don't guess.**
- Jargon allowed only at Level 2 / under-the-hood: *SQL, model, temperature, deterministic.*
```
