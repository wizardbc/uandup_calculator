export type Mode = "graphing" | "scientific";
export type AngleMode = "radians" | "degrees";
export type Viewport = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
};
export type GraphSettings = {
  grid: boolean;
  minorGrid: boolean;
  axisNumbers: boolean;
  xAxis: boolean;
  yAxis: boolean;
  arrows: boolean;
  polar: boolean;
  xLabel: string;
  yLabel: string;
  xStep: string;
  yStep: string;
  reverseContrast: boolean;
  largeText: boolean;
  degrees: boolean;
};
export type Expression = {
  id: string;
  type: "expression";
  latex: string;
  color: string;
  hidden: boolean;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  opacity?: number;
  logMode?: boolean;
};
export type Table = {
  id: string;
  type: "table";
  color: string;
  hidden: boolean;
  headers: string[];
  values: string[][];
};
export type Item = Expression | Table;
export type GraphState = {
  items: Item[];
  viewport: Viewport;
  settings: GraphSettings;
};
export type ScientificState = { items: Expression[]; degrees: boolean };
export type CalculatorState = {
  version: 1;
  mode: Mode;
  graph: GraphState;
  scientific: ScientificState;
};
export type Geometry = {
  kind: "path" | "segments" | "points" | "triangles";
  start: number;
  count: number;
  dashed: boolean;
};
export type Interest = { x: number; y: number; kind: string };
export type RowResult = {
  id: string;
  kind: string;
  display: string | null;
  value: number | null;
  error: string | null;
  missing: string[];
  slider: string | null;
  geometry: Geometry[];
  points: Interest[];
  fit: {
    parameters: Record<string, number>;
    rSquared: number;
    residuals: number[];
    logMode: boolean;
    logModeAvailable: boolean;
    rmse: number;
  } | null;
};
export type Scene = {
  revision?: number;
  rows: RowResult[];
  evaluations: number;
  engine: string;
  data: Float64Array;
  viewport: Viewport;
  duration: number;
};
export type EngineInput = {
  expressions: {
    id: string;
    latex: string;
    hidden?: boolean;
    auxiliary?: boolean;
  }[];
  viewport: Viewport;
  degrees: boolean;
  scientific: boolean;
};
export const COLORS = [
  "#c74440",
  "#2d70b3",
  "#388c46",
  "#6042a6",
  "#000000",
  "#fa7e19",
];
export const DEFAULT_SETTINGS: GraphSettings = {
  grid: true,
  minorGrid: true,
  axisNumbers: true,
  xAxis: true,
  yAxis: true,
  arrows: false,
  polar: false,
  xLabel: "",
  yLabel: "",
  xStep: "",
  yStep: "",
  reverseContrast: false,
  largeText: false,
  degrees: false,
};
export const newId = () =>
  crypto.randomUUID?.() ??
  `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const expression = (index = 0, latex = ""): Expression => ({
  id: newId(),
  type: "expression",
  latex,
  color: COLORS[index % COLORS.length],
  hidden: false,
});
export function initialState(): CalculatorState {
  return {
    version: 1,
    mode:
      new URLSearchParams(location.search).get("mode") === "scientific"
        ? "scientific"
        : "graphing",
    graph: {
      items: [expression()],
      viewport: {
        xMin: -10,
        xMax: 10,
        yMin: -8.68056,
        yMax: 8.68056,
        width: 864,
        height: 750,
      },
      settings: { ...DEFAULT_SETTINGS },
    },
    scientific: { items: [expression()], degrees: false },
  };
}
export function engineInput(state: CalculatorState): EngineInput {
  if (state.mode === "scientific")
    return {
      expressions: state.scientific.items,
      degrees: state.scientific.degrees,
      scientific: true,
      viewport: state.graph.viewport,
    };
  const expressions: EngineInput["expressions"] = [];
  for (const row of state.graph.items) {
    if (row.type === "expression") expressions.push(row);
    else {
      const complete = row.values.filter((v) => v[0]?.trim() && v[1]?.trim());
      row.headers.forEach((name, col) =>
        expressions.push({
          id: `${row.id}-col-${col}`,
          latex: `${name}=[${complete.map((v) => v[col]).join(",")}]`,
          auxiliary: true,
        }),
      );
      expressions.push({
        id: row.id,
        latex: `(${row.headers.join(",")})`,
        hidden: row.hidden,
      });
    }
  }
  return {
    expressions,
    viewport: state.graph.viewport,
    degrees: state.graph.settings.degrees,
    scientific: false,
  };
}
