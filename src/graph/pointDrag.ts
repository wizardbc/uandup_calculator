import { numberLatex } from "../components/resultLatex";
import type { Item, RowResult, Scene } from "../types";
import { computedColumns } from "../engine/tables";
/** Replace one coordinate of a point while preserving its assignment and other coordinate. */
function replaceCoordinate(latex: string, axis: number, value: string): string {
  const equals = latex.indexOf("=");
  const prefix = equals >= 0 ? latex.slice(0, equals + 1) : "";
  const body = (equals >= 0 ? latex.slice(equals + 1) : latex)
    .replace(/\\(?:left|right)/g, "")
    .trim();
  if (!body.startsWith("(") || !body.endsWith(")")) return latex;
  let depth = 0,
    comma = -1;
  for (let i = 1; i < body.length - 1; i++) {
    if ("([{".includes(body[i])) depth++;
    else if (")]}".includes(body[i])) depth--;
    else if (body[i] === "," && depth === 0) {
      comma = i;
      break;
    }
  }
  if (comma < 0) return latex;
  const coordinates = [body.slice(1, comma), body.slice(comma + 1, -1)];
  coordinates[axis] = value;
  return `${prefix}\\left(${coordinates.join(",")}\\right)`;
}
export function dragPoint(
  items: Item[],
  row: RowResult,
  mode: string,
  x: number,
  y: number,
  tableIndex?: number,
  pointIndex = 0,
  scene?: Scene | null,
): Item[] {
  const next = items.map((item) => ({ ...item }));
  const table = next.find(
    (i) =>
      i.type === "table" &&
      (row.id === i.id || row.id.startsWith(`${i.id}:plot:`)),
  );
  if (table?.type === "table" && tableIndex !== undefined) {
    const column = row.id === table.id ? 1 : Number(row.id.split(":plot:")[1]);
    const computed = computedColumns(table, items);
    table.values = table.values.map((r) => [...r]);
    if (table.values[tableIndex]) {
      if ((mode === "x" || mode === "xy") && !computed[0])
        table.values[tableIndex][0] = numberLatex(x, 10);
      if ((mode === "y" || mode === "xy") && !computed[column])
        table.values[tableIndex][column] = numberLatex(y, 10);
    }
    return next;
  }
  for (let axis = 0; axis < 2; axis++) {
    if (
      mode === "none" ||
      (mode === "x" && axis === 1) ||
      (mode === "y" && axis === 0)
    )
      continue;
    const target = row.pointDrag?.[pointIndex]?.[axis] ?? row.drag?.[axis];
    if (!target) continue;
    const item = next.find((i) => i.id === target.id);
    if (item?.type !== "expression") continue;
    let n = axis === 0 ? x : y;
    if (target.coordinate === null) {
      const bounds = scene?.rows.find((r) => r.id === item.id)?.sliderBounds;
      const lo = bounds?.min ?? item.sliderMin ?? -Infinity,
        hi = bounds?.max ?? item.sliderMax ?? Infinity,
        step = bounds?.step ?? item.sliderStep;
      if (step) {
        const origin = Number.isFinite(lo) ? lo : 0;
        n = origin + Math.round((n - origin) / step) * step;
      }
      n = Math.max(lo, Math.min(hi, n));
    }
    const value = numberLatex(n, 10);
    if (target.coordinate === null)
      item.latex = `${item.latex.split("=")[0]}=${value}`;
    else if (target.list_index != null) {
      const equals = item.latex.indexOf("=");
      const prefix = equals < 0 ? "" : item.latex.slice(0, equals + 1);
      const body = (equals < 0 ? item.latex : item.latex.slice(equals + 1))
        .replace(/\\(?:left|right)/g, "")
        .trim();
      const parts: string[] = [];
      let depth = 0,
        start = 1;
      for (let i = 1; i < body.length - 1; i++) {
        if ("([{".includes(body[i])) depth++;
        else if (")]}".includes(body[i])) depth--;
        else if (body[i] === "," && depth === 0) {
          parts.push(body.slice(start, i));
          start = i + 1;
        }
      }
      parts.push(body.slice(start, -1));
      if (parts[target.list_index] !== undefined) {
        parts[target.list_index] = replaceCoordinate(
          parts[target.list_index],
          target.coordinate,
          value,
        );
        item.latex = prefix + "[" + parts.join(",") + "]";
      }
    } else item.latex = replaceCoordinate(item.latex, target.coordinate, value);
  }
  return next;
}
