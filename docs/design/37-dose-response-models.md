# 37 — Nonlinear regression: the dose-response model family

Issue #95, the follow-up to notes 32, 35 and 36. Note 32 fitted one model,
Prism's "log(agonist) vs. response — Variable slope". This adds the rest of
Prism's *dose-response* family on the same fitting core. The wider curve
library the issue also lists (exponential growth/decay, Michaelis–Menten,
Gaussian, …) is a different core (other parameters, other starts, no log
X) and is split off (below).

## What was built

`options.model` is a union of eight ids (`DOSE_RESPONSE_MODEL_IDS`,
`src/model/project.ts`), Prism's names:

| Prism model | id | holds |
|---|---|---|
| log(agonist) vs. response — variable slope | `log-agonist-variable-slope` | nothing |
| log(agonist) vs. response (three parameters) | `log-agonist-standard-slope` | HillSlope = 1 |
| log(agonist) vs. normalized response — variable slope | `log-agonist-normalized-variable-slope` | Bottom = 0, Top = 100 |
| log(agonist) vs. normalized response | `log-agonist-normalized-standard-slope` | Bottom = 0, Top = 100, HillSlope = 1 |
| the four above for log(inhibitor) | `log-inhibitor-…` | same, with HillSlope = −1 for a standard slope |

### One curve, not eight

Prism's equations for the inhibitor models are the agonist equation with
the potency renamed and the slope's sign turned:

- agonist: Y = Bottom + (Top − Bottom) / (1 + 10^((LogEC50 − X) · HillSlope))
- inhibitor: the same, written IC50, with a negative HillSlope for the
  usual falling curve; the standard-slope inhibitor is
  Y = Bottom + (Top − Bottom) / (1 + 10^(X − LogIC50)), i.e. HillSlope = −1.

So no new fit code is needed. The R fit (`analysis.R`) is unchanged:
a model is a set of *held parameters* plus a *label*
(`src/analyses/nonlinear-regression/models.ts`). `effectiveConstraints`
overlays the model's holds (as `fixed`) on the user's constraints from
note 35; `prepare`, `optionsProblem` (note 35), the comparison check
(note 36) and the Analyze dialog all read that one overlay. Model
comparison (note 36) therefore keeps working unchanged: the simpler model
can only hold what the fit — model included — leaves free, so a
normalized fit can be compared on HillSlope only, and a fit with nothing
free has the comparison switched off.

The user's constraint on a parameter the model holds is ignored (the
dialog shows "held at … by the model chosen above" instead of the
control). Result `constraints` are the effective ones, so the results'
"held at …" sentence and the "(fixed)" status describe what really ran.

### Naming and sign

- Typed results keep `logEc50` / `ec50` for every model; only the label is
  the model's (`potency`: EC50 or IC50). Labels flow through the results
  grid, headline, methods line, margin note and the comparison rows.
- An inhibitor curve reports HillSlope < 0 and Bottom < Top, the way
  Prism does. Unconstrained fits still swap the plateaus so Bottom is the
  lower one (note 32); constrained ones never do.
- The agonist/inhibitor choice does **not** change the numbers of a
  variable-slope fit: the two models are the same curve. It matters for the
  standard slope (±1), where the wrong choice fits the data poorly, and for
  the words.

### Start values

Unchanged from notes 32 and 35: the unconstrained variable-slope fit
uses `plinear` from a grid of LogEC50 and ±HillSlope starts; any held
parameter goes through the multi-started `port` fit (both plateau orders).
The standard-slope and normalized models are constrained fits and use
that path; nothing model-specific was needed.

### `.bsig`

The `model` field already existed and held the one id; it now accepts the
eight. No schema bump (old files' id is still valid). The analysis
module's `version` went 3 → 4 so stored results recompute and carry
`model`.

## Intentional differences from Prism

- **No default HillSlope limit.** We don't pre-fill "HillSlope < 0" for
  inhibitor models; nothing is constrained unless the model or the user
  says so. The direction is whatever the data give.
- **A model of the wrong direction is not rejected.** An agonist
  standard-slope fit of a falling curve runs and returns Bottom above Top
  with a poor fit (not swapped, since the slope is held). The guide says to
  choose the inhibitor model; Prism behaves alike but sometimes refuses.
- **[agonist] vs. response on a linear axis is not a separate model.** It
  is the same curve as log(agonist) (Prism itself fits EC50 directly); the
  existing "doses or concentrations" X option logs the dose and gives the
  same numbers, so a zero dose is left out (Prism's linear form could keep
  it). Fitting on the linear scale directly is not planned.
- Prism's "Bottom … must be less than Top"-style default constraints and
  its other dose-response variants (biphasic, bell-shaped, Hill,
  "log(agonist) vs. response — find ECanything", "operational model")
  are not included.

## Validation

`oracle.R` gains a "Dose-response models" section. Each case states the
model's holds by hand in `limits(...)` — independent of `models.ts` — while
its fixture options carry only `model`; the test builds the request from
`model` through `effectiveConstraints`, so a preset that drifted from the
oracle's hand-written bounds fails. The references are the existing ones
(the base-R projected Levenberg-Marquardt fit, numerical Jacobian) checked
against `drc::drm(L.4())` with the same fixed parameters and the
Kuhn–Tucker check. Cases:

- inhibitor, variable slope, concentrations in duplicate with a zero dose;
- inhibitor, standard slope (−1), same data;
- inhibitor normalized, variable and standard slope (triplicate percent
  of control);
- agonist normalized, variable and standard slope (noise past 0 and 100);
- agonist standard slope, n = 5 (df = 2: the smallest fit);
- inhibitor normalized standard slope with only one shoulder measured
  (near-degenerate: a free fit would not converge);
- one point for the one parameter left (refusal).

The parity test reruns the recorded R in the app's WebR. Missing values
are dropped as pairs before the engine (the fixtures list complete pairs),
as for every XY analysis.

An agonist standard slope on falling data was tried as an oracle case and
dropped: with the slope held the plateau estimates are collinear and drc's
own solver reports a singular system, so there is no independent
reference. The behaviour is described above instead.

## Wrong-way warning (#108)

A standard-slope fit whose direction opposes the data adds a line to the
results' warnings, naming the other direction's model. Non-normalized
models: fitted Top below Bottom. Normalized ones (plateaus held): the sign
of the data's X–Y correlation against the held slope. Pure function in
`direction.ts`; variable-slope models are never flagged.

## Follow-ups

- The wider curve library: exponential growth/decay, Michaelis–Menten,
  Gaussian, etc. (filed as a new issue). It needs a model-generic
  parameter list in the result type, results grid and comparison, which
  today name Bottom/Top/LogEC50/HillSlope.
