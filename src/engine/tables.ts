import {
  regressionModels,
  regressionLatex,
  regressionParameter,
} from "./regressionModels.ts";
import type { EngineInput, Item, Table, RowResult } from "../types";
export function tableCoordinates(
  columns: (RowResult | undefined)[],
): [number, number][][] {
  const x = columns[0]?.listValues ?? [];
  return columns.slice(1).map((column) =>
    x.flatMap((value, i) => {
      const a = Number(value),
        b = Number(column?.listValues?.[i]);
      return Number.isFinite(a) && Number.isFinite(b)
        ? [[a, b] as [number, number]]
        : [];
    }),
  );
}
export const simpleVariable = (s: string) =>
  /^(?:[A-Za-z]|\\(?:theta|alpha|beta))(?:_(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9]+))?$/.test(
    s.trim(),
  );
const name = (s: string) => s.replace(/[{}\s]/g, "");
export function computedColumns(table: Table, items: Item[]): boolean[] {
  const defined = new Set(
    items
      .filter((i) => i.type === "expression" && i.latex.includes("="))
      .map((i) => (i.type === "expression" ? i.latex.split("=")[0] : ""))
      .map(name),
  );
  return table.headers.map((h) => !simpleVariable(h) || defined.has(name(h)));
}
export function tableExpressions(
  table: Table,
  items: Item[],
): EngineInput["expressions"] {
  const computed = computedColumns(table, items);
  const rows: EngineInput["expressions"] = table.headers.map((header, c) => {
    let last = table.values.length - 1;
    while (last >= 0 && !table.values[last][c]?.trim()) last--;
    const values = table.values
      .slice(0, last + 1)
      .map((v) => v[c]?.trim() || "0/0");
    return {
      id: `${table.id}-col-${c}`,
      latex: computed[c] ? header : `${header}=[${values.join(",")}]`,
      auxiliary: true,
    };
  });
  for (let c = 1; c < table.headers.length; c++)
    rows.push({
      id: c === 1 ? table.id : `${table.id}:plot:${c}`,
      latex: `(${table.headers[0]},${table.headers[c]})`,
      hidden: table.hidden || table.columnHidden?.[c],
      ...{
        plotStyle: table.columnStyles?.[c],
        colorLatex: table.columnColorLatex?.[c] || undefined,
      },
    });
  if (table.regression) {
    const r = table.regression,
      model = regressionModels[r.model];
    rows.push({
      id: `${table.id}:regression`,
      latex: regressionLatex(table, true),
      hidden: table.hidden || r.hidden,
      ...{
        regressionParameters: model.parameters.map((n) =>
          regressionParameter(table, n),
        ),
        residualVariable: r.residualVariable,
        logMode: r.logMode,
      },
    });
  }
  return rows;
}
