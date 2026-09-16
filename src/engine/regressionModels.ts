import { numberLatex } from "../components/resultLatex.ts";
import type { Table } from "../types";
export const regressionModels = {
  linear: { label: "Linear", latex: "mx+b", parameters: ["m", "b"] },
  quadratic: {
    label: "Quadratic",
    latex: "ax^2+bx+c",
    parameters: ["a", "b", "c"],
  },
  cubic: {
    label: "Cubic",
    latex: "ax^3+bx^2+cx+d",
    parameters: ["a", "b", "c", "d"],
  },
  quartic: {
    label: "Quartic",
    latex: "ax^4+bx^3+cx^2+dx+k",
    parameters: ["a", "b", "c", "d", "k"],
  },
  exponential: { label: "Exponential", latex: "ab^x", parameters: ["a", "b"] },
  logarithmic: {
    label: "Logarithmic",
    latex: "a+b\\ln(x)",
    parameters: ["a", "b"],
  },
  power: { label: "Power", latex: "ax^b", parameters: ["a", "b"] },
  logistic: {
    label: "Logistic",
    latex: "\\frac{L}{1+ae^{-kx}}",
    parameters: ["L", "a", "k"],
  },
  sinusoidal: {
    label: "Sinusoidal",
    latex: "a\\sin(bx+c)+d",
    parameters: ["a", "b", "c", "d"],
  },
};
export function regressionParameter(table: Table, name: string) {
  return `${name}_R${table.id.replace(/[^A-Za-z0-9]/g, "")}`;
}
export function regressionValues(
  table: Table,
  parameters: Record<string, number>,
) {
  return Object.fromEntries(
    regressionModels[table.regression!.model].parameters.map((name) => [
      name,
      parameters[regressionParameter(table, name)],
    ]),
  );
}
export function regressionLatex(table: Table, internal = false) {
  const fit = table.regression!;
  const model = regressionModels[fit.model];
  let latex = model.latex.replace(/([a-zA-Z])x/g, "$1\\cdot x");
  latex = latex.replace(/\\[a-z]+|[a-zA-Z]/g, (name) =>
    name === "x"
      ? `(${table.headers[fit.xColumn]})`
      : internal && model.parameters.includes(name)
        ? `${name}_{R${table.id.replace(/[^A-Za-z0-9]/g, "")}}`
        : name,
  );
  return `${table.headers[fit.yColumn]}~${latex}`;
}
export function fitEquation(
  model: Table["regression"],
  parameters: Record<string, number>,
): string {
  if (!model) return "";
  let latex = regressionModels[model.model].latex;
  latex = latex.replace(/\\[a-z]+|[a-zA-Z]/g, (name) =>
    name in parameters ? `(${numberLatex(parameters[name], 6)})` : name,
  );
  return `y=${latex}`
    .replace(/\+\(-/g, "-(")
    .replace(/\(([-\d.]+)\)(?=[x\\]|$|[+\-])/g, "$1")
    .replace(/\+0$/, "");
}
