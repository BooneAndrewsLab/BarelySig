# Formatting a graph

Click any part of a graph — an axis, a bar, a point, an error bar, a
bracket, the legend — to format it. The panel beside the graph then shows
that part's settings and outlines it on the graph. **Done**, `Escape` or a
click on an empty spot goes back to the graph's own settings.

The **Format** list at the top of the panel names every part of the graph;
choosing one there does the same as clicking it, for when a part is hard
to hit or from the keyboard.

Every change is one undo step. **Reset to the theme** puts the selected
part back as the theme draws it; **Reset all formatting** (in the graph's
settings) does it for the whole graph. A blank number field means
"automatic" or "as the theme has it".

## Axes

- **Y axis:** its **Minimum** and **Maximum** (blank for automatic), a
  **Logarithmic scale (powers of 10)**, the tick **Interval** and number of
  **Decimals**, tick **Direction** and **Length**, the tick label size,
  and the line widths. **Frame** draws a box around the plot instead of
  only the left and bottom axes.
- On a log axis, values of zero or below can't be drawn; the note under
  the graph says how many were left out. Bars rise from the bottom of the
  axis.
- **Y axis title:** its text (blank: the table's) and size.
- **X axis and group labels:** the labels level (wrapped to fit),
  **Turned 45°** or **Vertical**, for long group names.

## Data sets

Clicking a bar, a box, a violin or a point selects its data set:

- **Colour:** one of the colour-blind-safe palette's colours or a grey. A
  data set's colour is the table's, so it changes in every graph of that
  table.
- **Symbol:** circle, square, triangle or diamond, for this graph.
- For all data sets: bar or box width, fill lightness, edge width, point
  size, point opacity and point edge width.

**Error bars** have their line width and cap width, and which error bar to
show.

## Brackets

Select a bracket to move it or change how all brackets look:

- **Drag** a bracket (or its label) up to raise it; the brackets stacked
  above it move with it, so none overlap. The arrow keys move a selected
  bracket 1 pt (`Shift`: 5 pt).
- A bracket's automatic place is the lowest that clears the data and the
  brackets under it: it can be raised and brought back, never lowered into
  the data. **Reset to the theme** puts it back.
- **Hide this bracket** removes one comparison from the graph; tick it
  again under **Significance** to bring it back.
- Label size and line width apply to all brackets.

## Title and legend

**Show the graph's name above it** (in the graph's settings) draws a
title; select it to change its size or the name. A grouped graph's
**Legend** can be selected to change its text size.
