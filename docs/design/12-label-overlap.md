# 12. Group labels that would overlap

Written 2026-09-26 before fixing #61 (UI revamp milestone), seen on a
screening export (#60 follow-up): groups named `CGA_DMSO_3day`,
`CGA_DMSO_5day`, `Normalized colony size` ran into each other under a
70 mm graph at the default level angle; only the last wrapped. Nothing
here changes the model or the file format; #43's figure recipe gains one
more resolved value (note 05).

## What was asked

"When group labels at 0° would overlap, the default graph should avoid
it without formatting: wrap at spaces/underscores, or turn them (45°)
automatically, as seaborn users do by hand. The chosen angle is resolved
into the figure recipe like any other value, so old figures don't
change."

## Why labels still overlapped

`wrap()` (`src/graphs/text/measure.ts`) only breaks a label at spaces: a
group named with underscores instead of spaces (a common lab convention:
plate × condition × day) is one unbreakable "word", so it never wraps
and can run into its neighbour. Turned labels (45°/90°) are laid out as
the whole title, unwrapped, by design (note 07), and were never checked
against their slot's width either — nothing in `layoutColumn` measured
the final geometry, so a graph with many groups and long titles could
silently overlap at any angle.

## Decisions

1. **`wrap()` also breaks after an underscore**, keeping the underscore
   with the piece before it (`CGA_`, `DMSO_`, `3day`, never a space in
   place of one): a word is tokenised into pieces at each `_`, and lines
   are built by adding the next piece, with a space between two pieces
   only when they came from different source words. A piece still wider
   than the slot stays whole on its own line, as before — a label is
   never cut mid-word.
2. **`xAngle` unset means automatic, not "always level."** `layoutColumn`
   now measures whether labels would overlap at 0° (any wrapped line
   wider than its slot, after the fix above) and escalates only if they
   would: 0° → 45° → 90°, stopping at the first angle whose labels fit.
   An explicit 45° or 90° from the inspector is still a hard override —
   never escalated further, never wrapped — exactly as before. If even
   90° still overlaps (dozens of very narrow slots with long
   single-token names), the graph keeps 90° and a note says so under the
   figure, the same pattern as a squeezed beeswarm (note 05): nothing is
   truncated or guessed at.
3. **The resolved angle is frozen into the figure recipe.** `Scene`
   gains `resolvedXAngle`: the angle `layoutColumn` actually drew with.
   When the graph's own `format.xAngle` was left unset, the exported
   recipe's copy of the graph carries that concrete angle instead,
   exactly as the theme is resolved today (`recipeProject`, note 05). A
   later change to the overlap heuristic (a wider tolerance, a smarter
   wrap) then can't silently turn an old exported figure's labels that
   used to be level, or vice versa.
4. **The inspector's "Level" option is relabelled "Automatic"** (its
   value is unchanged, unset; only what it's called), since choosing it
   no longer guarantees level.

## Prism parity

Prism doesn't auto-rotate: a user drags the axis label angle by hand and
lives with the overlap otherwise. BarelySig's plain-language principle
(no statistics background assumed) extends to "the figure should be
readable without opening a menu first," so this is an intentional
difference, in the direction seaborn users already take by hand.
