import { tableExpressions } from "./engine/tables";
export type Mode = "graphing" | "scientific";
export type AngleMode = "radians" | "degrees";
export type PlotStyle = {
  points?: boolean;
  lines?: boolean;
  fill?: boolean;
  pointStyle?:
    | "point"
    | "open"
    | "cross"
    | "square"
    | "plus"
    | "triangle"
    | "diamond"
    | "star";
  pointOutline?: boolean;
  pointSize?: string;
  pointOpacity?: string;
  lineWidth?: string;
  lineOpacity?: string;
  fillOpacity?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  showLabel?: boolean;
  label?: string;
  labelSize?: string;
  labelAngle?: string;
  labelOutline?: boolean;
  screenReaderLabel?: string;
  labelOrientation?:
    | "default"
    | "above"
    | "below"
    | "left"
    | "right"
    | "above_left"
    | "above_right"
    | "below_left"
    | "below_right";
  dragMode?: "none" | "x" | "y" | "xy";
};
export type Viewport = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
  xLog?: boolean;
  yLog?: boolean;
  boundsLatex?: Partial<Record<"xMin" | "xMax" | "yMin" | "yMax", string>>;
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
  complex: boolean;
  braille: "none" | "Nemeth" | "UEB";
  sixKey: boolean;
  lockViewport: boolean;
  xLog: boolean;
  yLog: boolean;
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
  sliderMinLatex?: string;
  sliderMaxLatex?: string;
  sliderStepLatex?: string;
  sliderSpeed?: number;
  sliderLoopMode?:
    "LOOP_FORWARD_REVERSE" | "LOOP_FORWARD" | "PLAY_ONCE" | "PLAY_INDEFINITELY";
  lineWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  opacity?: number;
  logMode?: boolean;
  residualVariable?: string;
  colorLatex?: string;
  domainMin?: string;
  domainMax?: string;
  plotStyle?: PlotStyle;
  inferenceLevel?: string;
  inferenceNull?: string;
  inferenceTails?: "left" | "both" | "right";
  visualization?: {
    histogramMode?: "count" | "relative" | "density";
    binAlignment?: "center" | "left";
    boxOffset?: string;
    boxHeight?: string;
    showOutliers?: boolean;
  };
  distribution?: {
    show?: boolean;
    summary?: boolean;
    region?: "inner" | "outer" | "left" | "right";
    compute?: "area" | "bounds";
    lower?: string;
    upper?: string;
    area?: string;
  };
};
export type Table = {
  id: string;
  type: "table";
  color: string;
  hidden: boolean;
  headers: string[];
  values: string[][];
  columnColors?: string[];
  columnColorLatex?: string[];
  columnHidden?: boolean[];
  columnStyles?: PlotStyle[];
  regression?: {
    model:
      | "linear"
      | "quadratic"
      | "cubic"
      | "quartic"
      | "exponential"
      | "logarithmic"
      | "power"
      | "logistic"
      | "sinusoidal";
    xColumn: number;
    yColumn: number;
    color: string;
    hidden: boolean;
    residualVariable: string;
    logMode?: boolean;
  };
};
export type Item = Expression | Table;
export type GraphState = {
  randomSeed?: number;
  items: Item[];
  viewport: Viewport;
  settings: GraphSettings;
};
export type ScientificState = {
  items: Expression[];
  degrees: boolean;
  complex: boolean;
};
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
  sliderBounds?: {
    min: number;
    max: number;
    step: number | null;
    error: string | null;
  };
  inference?: InferenceResult | null;
  inferenceChart?: number[][];
  statistics?: {
    count: number;
    mean: number;
    median: number;
    stdev: number | null;
    stdevp: number;
    fiveNumber: number[];
  } | null;
  visualization?: {
    kind: string;
    data: number[];
    width: number;
    vertices: number[][];
  } | null;
  distribution?: {
    kind: string;
    parameters: number[];
    mean: number | null;
    median: number | null;
    stdev: number | null;
    variance: number | null;
    lower: number | null;
    upper: number | null;
    area: number;
    discrete: boolean;
  } | null;
  colors?: string[];
  colorName?: string | null;
  strokeColors?: string[];
  tones?: number[][];
  domain?: { variable: string; min: string; max: string } | null;
  listValues?: string[] | null;
  listLength?: number;
  listLiteral?: boolean;
  styleValues?: Record<string, number[]>;
  label?: string;
  drag?: ({
    id: string;
    coordinate: number | null;
    list_index?: number | null;
  } | null)[];
  pointDrag?: ({
    id: string;
    coordinate: number | null;
    list_index?: number | null;
  } | null)[][];
  defaultDragMode?: string;
  geometry: Geometry[];
  points: Interest[];
  residualVariable?: string;
  regressionX?: string;
  fit: {
    parameters: Record<string, number>;
    rSquared: number;
    residuals: number[];
    logMode: boolean;
    logModeAvailable: boolean;
    rmse: number;
    correlation?: number | null;
    standardErrors?: Record<string, number>;
    degreesOfFreedom?: number;
  } | null;
};
export type InferenceResult = {
  kind: string;
  estimate: number;
  stderr: number;
  dof: number | null;
  null: number;
  score: number;
  p: number;
  pleft: number;
  pright: number;
  level: number;
  lower: number;
  upper: number;
  observed: number[][];
  expected: number[][];
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
  randomSeed?: number;
  expressions: {
    id: string;
    latex: string;
    hidden?: boolean;
    auxiliary?: boolean;
  }[];
  viewport: Viewport;
  degrees: boolean;
  scientific: boolean;
  complex: boolean;
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
  complex: false,
  braille: "none",
  sixKey: false,
  lockViewport: false,
  xLog: false,
  yLog: false,
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
      randomSeed: crypto.getRandomValues(new Uint32Array(1))[0],
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
    scientific: { items: [expression()], degrees: false, complex: false },
  };
}
export function engineInput(state: CalculatorState): EngineInput {
  if (state.mode === "scientific")
    return {
      expressions: state.scientific.items,
      degrees: state.scientific.degrees,
      scientific: true,
      complex: state.scientific.complex,
      randomSeed: state.graph.randomSeed ?? 0,
      viewport: state.graph.viewport,
    };
  const expressions: EngineInput["expressions"] = [];
  for (const row of state.graph.items) {
    if (row.type === "expression") expressions.push(row);
    else {
      expressions.push(...tableExpressions(row, state.graph.items));
    }
  }
  for (const [key, latex] of Object.entries(
    state.graph.viewport.boundsLatex ?? {},
  ))
    if (latex)
      expressions.push({ id: `__viewport-${key}`, latex, auxiliary: true });
  for (const axis of ["x", "y"] as const) {
    const latex = state.graph.settings[`${axis}Step`];
    if (latex)
      expressions.push({ id: `__step-${axis}`, latex, auxiliary: true });
  }
  return {
    expressions,
    viewport: state.graph.viewport,
    degrees: state.graph.settings.degrees,
    scientific: false,
    complex: state.graph.settings.complex,
    randomSeed: state.graph.randomSeed ?? 0,
  };
}
