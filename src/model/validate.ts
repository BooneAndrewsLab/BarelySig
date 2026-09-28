/**
 * Invariants of the model (item 02), checked on every load and after
 * edits in tests. They are about structure only. Values a user can type
 * but that make no sense (a negative SD, a fractional n) are not
 * invariants: the analysis that reads them reports them in plain language.
 *
 * Each function returns the problems found, empty when the value is valid.
 */
import { analysisOrder } from './deps';
import type { Id } from './ids';
import type { Project } from './project';
import { type Table, parseCellKey, subcolumnCount } from './table';

const MAX_DECIMALS = 15;

export function validateTable(table: Table): string[] {
  const problems: string[] = [];
  const where = `table ${table.id}`;
  const { format } = table;

  if (format.kind === 'replicates') {
    if (!Number.isInteger(format.count) || format.count < 1) {
      problems.push(`${where}: replicate count ${String(format.count)} is not a positive integer`);
    }
    if (table.type === 'column' && format.count !== 1) {
      problems.push(
        `${where}: a Column table has one replicate subcolumn, not ${String(format.count)}`,
      );
    }
    if (table.type === 'contingency' && format.count !== 1) {
      problems.push(
        `${where}: a Contingency table has one count per cell, not ${String(format.count)}`,
      );
    }
  } else if (table.type === 'column' && table.rows.length !== 1) {
    problems.push(
      `${where}: a Column table of summary data has one row, not ${String(table.rows.length)}`,
    );
  } else if (table.type === 'nested') {
    problems.push(`${where}: a Nested table needs individual values, not summary data`);
  } else if (table.type === 'contingency') {
    problems.push(`${where}: a Contingency table has one count per cell, not summary data`);
  }

  if (table.type === 'nested' && table.replicateTitles !== undefined) {
    if (table.replicateTitles.length !== subcolumnCount(format)) {
      problems.push(
        `${where}: ${String(table.replicateTitles.length)} replicate titles for ${String(subcolumnCount(format))} replicates`,
      );
    }
  }

  const rowIds = new Set<Id>();
  for (const r of table.rows) {
    if (rowIds.has(r.id)) problems.push(`${where}: row id ${r.id} is repeated`);
    rowIds.add(r.id);
  }

  const expected = subcolumnCount(format);
  const dsIds = new Set<Id>();
  for (const ds of table.dataSets) {
    const at = `${where}, data set ${ds.id}`;
    if (dsIds.has(ds.id)) problems.push(`${at}: id is repeated`);
    dsIds.add(ds.id);
    if (ds.subcolumns.length !== expected) {
      problems.push(
        `${at}: has ${String(ds.subcolumns.length)} subcolumns, the format needs ${String(expected)}`,
      );
    }
    ds.subcolumns.forEach((col, s) => {
      if (col.length !== table.rows.length) {
        problems.push(
          `${at}: subcolumn ${String(s)} has ${String(col.length)} cells for ${String(table.rows.length)} rows`,
        );
      }
      col.forEach((c, r) => {
        if (c !== null && !(typeof c === 'number' && Number.isFinite(c))) {
          problems.push(
            `${at}: cell ${String(s)}:${String(r)} is ${String(c)}, not a finite number or empty`,
          );
        }
        // A negative or fractional count is nonsensical, the same way a negative SD is
        // (this file's own scope note): not a structural invariant, refused in plain
        // language by contingency-chi-square/contingency-fisher's own prepare().
      });
    });
    for (const key of ds.excluded) {
      const { subcolumn, row } = parseCellKey(key);
      const r = table.rows.findIndex((x) => x.id === row);
      const col = ds.subcolumns[subcolumn];
      if (r < 0 || col === undefined) problems.push(`${at}: excluded cell ${key} does not exist`);
      else if (col[r] === null) problems.push(`${at}: excluded cell ${key} is empty`);
    }
    if (
      ds.decimals !== undefined &&
      !(Number.isInteger(ds.decimals) && ds.decimals >= 0 && ds.decimals <= MAX_DECIMALS)
    ) {
      problems.push(
        `${at}: decimals ${String(ds.decimals)} is not an integer from 0 to ${String(MAX_DECIMALS)}`,
      );
    }
  }
  return problems;
}

function sameMembers(order: readonly Id[], keys: Iterable<Id>): boolean {
  const k = new Set(keys);
  return (
    order.length === k.size &&
    new Set(order).size === order.length &&
    order.every((id) => k.has(id))
  );
}

export function validateProject(project: Project): string[] {
  const problems: string[] = [];
  const seen = new Set<Id>();
  const claim = (id: Id): void => {
    if (seen.has(id)) problems.push(`id ${id} is used more than once`);
    seen.add(id);
  };
  claim(project.id);

  const sections = [
    ['tables', project.tables],
    ['analyses', project.analyses],
    ['graphs', project.graphs],
    ['layouts', project.layouts],
  ] as const;
  for (const [name, map] of sections) {
    map.forEach((v: { readonly id: Id }, k) => {
      if (v.id !== k) problems.push(`${name}: ${k} is stored under the wrong key`);
      claim(v.id);
    });
    if (!sameMembers(project.order[name], map.keys())) {
      problems.push(`order.${name} does not list each of the ${name} exactly once`);
    }
  }

  project.tables.forEach((t) => {
    problems.push(...validateTable(t));
    t.dataSets.forEach((d) => {
      claim(d.id);
    });
    t.rows.forEach((r) => {
      claim(r.id);
    });
  });
  project.exports.forEach((x) => {
    claim(x.id);
  });

  project.analyses.forEach((a) => {
    const at = `analysis ${a.id}`;
    if (a.input.kind === 'table') {
      const t = project.tables.get(a.input.table);
      if (!t) {
        problems.push(`${at}: reads table ${a.input.table}, which does not exist`);
        return;
      }
      if (new Set(a.input.dataSets).size !== a.input.dataSets.length)
        problems.push(`${at}: a data set is listed twice`);
      for (const ds of a.input.dataSets) {
        if (!t.dataSets.some((d) => d.id === ds))
          problems.push(`${at}: reads data set ${ds}, not in table ${t.id}`);
      }
    } else if (!project.analyses.has(a.input.analysis)) {
      problems.push(`${at}: reads analysis ${a.input.analysis}, which does not exist`);
    }
  });
  if (analysisOrder(project).length !== project.analyses.size) {
    problems.push('analyses read from each other in a cycle, or from a missing analysis');
  }

  project.graphs.forEach((g) => {
    const src =
      g.source.kind === 'table'
        ? project.tables.get(g.source.table)
        : project.analyses.get(g.source.analysis);
    if (!src) problems.push(`graph ${g.id}: its source does not exist`);
    if (g.source.kind === 'table') {
      const t = project.tables.get(g.source.table);
      if (t && (t.type === 'grouped') !== (g.plot.kind === 'grouped-bars'))
        problems.push(`graph ${g.id}: a ${g.plot.kind} plot of a ${t.type} table`);
    }
    if (g.source.kind === 'table' && g.dataSets) {
      const t = project.tables.get(g.source.table);
      for (const d of g.dataSets) {
        if (t && !t.dataSets.some((x) => x.id === d))
          problems.push(`graph ${g.id}: plots data set ${d}, not in its table`);
      }
    }
    for (const a of g.analyses) {
      if (!project.analyses.has(a))
        problems.push(`graph ${g.id}: draws analysis ${a}, which does not exist`);
    }
  });
  project.layouts.forEach((l) => {
    for (const g of l.graphs) {
      if (!project.graphs.has(g))
        problems.push(`layout ${l.id}: holds graph ${g}, which does not exist`);
    }
  });
  return problems;
}
