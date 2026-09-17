import { DEFAULT_SETTINGS, type CalculatorState, type Item } from "./types";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function plotStyle(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!object(value)) return false;
  return (
    [
      "points",
      "lines",
      "fill",
      "pointOutline",
      "showLabel",
      "labelOutline",
    ].every((k) => value[k] === undefined || typeof value[k] === "boolean") &&
    [
      "pointSize",
      "pointOpacity",
      "lineWidth",
      "lineOpacity",
      "fillOpacity",
      "label",
      "screenReaderLabel",
      "labelSize",
      "labelAngle",
    ].every(
      (k) =>
        value[k] === undefined ||
        (typeof value[k] === "string" && value[k].length <= 512),
    ) &&
    (value.pointStyle === undefined ||
      [
        "point",
        "open",
        "cross",
        "square",
        "plus",
        "triangle",
        "diamond",
        "star",
      ].includes(String(value.pointStyle))) &&
    (value.lineStyle === undefined ||
      ["solid", "dashed", "dotted"].includes(String(value.lineStyle))) &&
    (value.labelOrientation === undefined ||
      [
        "default",
        "above",
        "below",
        "left",
        "right",
        "above_left",
        "above_right",
        "below_left",
        "below_right",
      ].includes(String(value.labelOrientation))) &&
    (value.dragMode === undefined ||
      ["none", "x", "y", "xy"].includes(String(value.dragMode)))
  );
}
function visualization(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    object(value) &&
    ["boxOffset", "boxHeight"].every(
      (k) =>
        value[k] === undefined ||
        (typeof value[k] === "string" && value[k].length <= 512),
    ) &&
    (value.histogramMode === undefined ||
      ["count", "relative", "density"].includes(String(value.histogramMode))) &&
    (value.binAlignment === undefined ||
      ["center", "left"].includes(String(value.binAlignment))) &&
    (value.showOutliers === undefined ||
      typeof value.showOutliers === "boolean")
  );
}
function distribution(value: unknown): boolean {
  return (
    value === undefined ||
    (object(value) &&
      ["show", "summary"].every(
        (k) => value[k] === undefined || typeof value[k] === "boolean",
      ) &&
      ["lower", "upper", "area"].every(
        (k) =>
          value[k] === undefined ||
          (typeof value[k] === "string" && value[k].length <= 512),
      ) &&
      (value.region === undefined ||
        ["inner", "outer", "left", "right"].includes(String(value.region))) &&
      (value.compute === undefined ||
        ["area", "bounds"].includes(String(value.compute))))
  );
}
function validItem(value: unknown): value is Item {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !/^[\w-]{1,100}$/.test(value.id) ||
    typeof value.color !== "string" ||
    !/^#[\da-fA-F]{6}$/.test(value.color) ||
    typeof value.hidden !== "boolean"
  )
    return false;
  if (
    value.type === "expression" &&
    ((value.logMode !== undefined && typeof value.logMode !== "boolean") ||
      (value.lineStyle !== undefined &&
        !["solid", "dashed", "dotted"].includes(String(value.lineStyle))))
  )
    return false;
  if (value.type === "expression")
    return (
      typeof value.latex === "string" &&
      value.latex.length <= 8192 &&
      visualization(value.visualization) &&
      plotStyle(value.plotStyle) &&
      distribution(value.distribution) &&
      [
        "inferenceLevel",
        "inferenceNull",
        "colorLatex",
        "domainMin",
        "domainMax",
        "residualVariable",
        "sliderMinLatex",
        "sliderMaxLatex",
        "sliderStepLatex",
      ].every(
        (k) =>
          value[k] === undefined ||
          (typeof value[k] === "string" && value[k].length <= 512),
      ) &&
      (value.inferenceTails === undefined ||
        ["left", "both", "right"].includes(String(value.inferenceTails))) &&
      (value.sliderLoopMode === undefined ||
        [
          "LOOP_FORWARD_REVERSE",
          "LOOP_FORWARD",
          "PLAY_ONCE",
          "PLAY_INDEFINITELY",
        ].includes(String(value.sliderLoopMode))) &&
      (value.sliderSpeed === undefined ||
        (typeof value.sliderSpeed === "number" &&
          value.sliderSpeed >= 0.05 &&
          value.sliderSpeed <= 20)) &&
      ["sliderMin", "sliderMax", "sliderStep", "lineWidth", "opacity"].every(
        (k) =>
          value[k] === undefined ||
          (typeof value[k] === "number" && Number.isFinite(value[k])),
      )
    );
  return (
    value.type === "table" &&
    (value.regression === undefined ||
      (object(value.regression) &&
        [
          "linear",
          "quadratic",
          "cubic",
          "quartic",
          "exponential",
          "logarithmic",
          "power",
          "logistic",
          "sinusoidal",
        ].includes(String(value.regression.model)) &&
        ["xColumn", "yColumn"].every(
          (k) =>
            typeof value.regression === "object" &&
            value.regression !== null &&
            Number.isInteger(
              (value.regression as Record<string, unknown>)[k],
            ) &&
            Number((value.regression as Record<string, unknown>)[k]) >= 0 &&
            Number((value.regression as Record<string, unknown>)[k]) <
              (Array.isArray(value.headers) ? value.headers.length : 0),
        ) &&
        typeof value.regression.hidden === "boolean" &&
        typeof value.regression.color === "string" &&
        /^#[\da-fA-F]{6}$/.test(value.regression.color) &&
        typeof value.regression.residualVariable === "string" &&
        value.regression.residualVariable.length <= 64 &&
        (value.regression.logMode === undefined ||
          typeof value.regression.logMode === "boolean"))) &&
    Array.isArray(value.headers) &&
    value.headers.length >= 2 &&
    value.headers.length <= 20 &&
    value.headers.every((v) => typeof v === "string" && v.length <= 64) &&
    (value.columnStyles === undefined ||
      (Array.isArray(value.columnStyles) &&
        value.columnStyles.length <= 20 &&
        value.columnStyles.every(plotStyle))) &&
    (value.columnColorLatex === undefined ||
      (Array.isArray(value.columnColorLatex) &&
        value.columnColorLatex.every(
          (c) => c == null || (typeof c === "string" && c.length <= 512),
        ))) &&
    (value.columnColors === undefined ||
      (Array.isArray(value.columnColors) &&
        value.columnColors.length <= 20 &&
        value.columnColors.every(
          (v) =>
            v == null || (typeof v === "string" && /^#[\da-fA-F]{6}$/.test(v)),
        ))) &&
    (value.columnHidden === undefined ||
      (Array.isArray(value.columnHidden) &&
        value.columnHidden.length <= 20 &&
        value.columnHidden.every(
          (v) => v == null || typeof v === "boolean",
        ))) &&
    Array.isArray(value.values) &&
    value.values.length <= 2000 &&
    value.values.every(
      (row) =>
        Array.isArray(row) &&
        row.length === (value.headers as string[]).length &&
        row.every((v) => typeof v === "string" && v.length <= 512),
    )
  );
}
export function validateState(value: unknown): CalculatorState {
  value = structuredClone(value);
  if (
    !object(value) ||
    value.version !== 1 ||
    !["graphing", "scientific"].includes(String(value.mode)) ||
    !object(value.graph) ||
    !object(value.scientific)
  )
    throw new Error("Invalid calculator state.");
  const { graph, scientific } = value;
  if (
    graph.randomSeed !== undefined &&
    (typeof graph.randomSeed !== "number" ||
      !Number.isSafeInteger(graph.randomSeed) ||
      graph.randomSeed < 0 ||
      graph.randomSeed > 0xffffffff)
  )
    throw new Error("Invalid random seed.");
  // Add defaults to older v1 snapshots without modifying the caller's object.
  if (object(graph.settings)) {
    // Theme selection replaces the retired contrast flag in older v1 snapshots.
    delete graph.settings.reverseContrast;
    graph.settings = { ...DEFAULT_SETTINGS, ...graph.settings };
  }
  if (scientific.complex === undefined) scientific.complex = false;
  if (
    !Array.isArray(graph.items) ||
    !Array.isArray(scientific.items) ||
    graph.items.length < 1 ||
    scientific.items.length < 1 ||
    graph.items.length + scientific.items.length > 150 ||
    !graph.items.every(validItem) ||
    !scientific.items.every((v) => validItem(v) && v.type === "expression")
  )
    throw new Error("Invalid expression list.");
  const ids = [...graph.items, ...scientific.items].map((i) => (i as Item).id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Expression IDs must be unique.");
  const v = graph.viewport;
  if (
    !object(v) ||
    !["xMin", "xMax", "yMin", "yMax", "width", "height"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k]),
    ) ||
    !(
      Number(v.xMin) < Number(v.xMax) &&
      Number(v.yMin) < Number(v.yMax) &&
      Number(v.width) > 0 &&
      Number(v.height) > 0
    )
  )
    throw new Error("Invalid graph bounds.");
  if (
    v.boundsLatex !== undefined &&
    (!object(v.boundsLatex) ||
      Object.entries(v.boundsLatex).some(
        ([key, latex]) =>
          !["xMin", "xMax", "yMin", "yMax"].includes(key) ||
          typeof latex !== "string" ||
          latex.length > 512,
      ))
  )
    throw new Error("Invalid axis bound expression.");
  if (
    ![Number(v.xMax) - Number(v.xMin), Number(v.yMax) - Number(v.yMin)].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error("Invalid graph span.");
  if (
    !object(graph.settings) ||
    typeof scientific.degrees !== "boolean" ||
    typeof scientific.complex !== "boolean"
  )
    throw new Error("Invalid calculator settings.");
  if (!["none", "Nemeth", "UEB"].includes(String(graph.settings.braille)))
    throw new Error("Invalid Braille mode.");
  for (const [key, expected] of Object.entries(DEFAULT_SETTINGS))
    if (
      typeof graph.settings[key] !== typeof expected ||
      (typeof graph.settings[key] === "string" &&
        String(graph.settings[key]).length > 100)
    )
      throw new Error("Invalid graph settings.");
  for (const axis of ["x", "y"] as const) {
    if (graph.settings[`${axis}Log`] && Number(v[`${axis}Min`]) <= 0)
      throw new Error("Logarithmic bounds must be positive.");
    v[`${axis}Log`] = graph.settings[`${axis}Log`];
  }
  return JSON.parse(JSON.stringify(value)) as CalculatorState;
}

export function installEmbed(api: {
  getState: () => CalculatorState;
  setState: (state: CalculatorState) => void;
  reset: () => void;
  focus: () => void;
}) {
  const origin = new URLSearchParams(location.search).get("hostOrigin");
  let target: string | null = null;
  try {
    if (
      origin &&
      new URL(origin).origin === origin &&
      ["https:", "http:"].includes(new URL(origin).protocol)
    )
      target = origin;
  } catch {
    /* Standalone calculator. */
  }
  const listener = (event: MessageEvent) => {
    if (
      !target ||
      event.origin !== target ||
      event.source !== window.parent ||
      !object(event.data) ||
      event.data.channel !== "uandup-calculator" ||
      event.data.version !== 1 ||
      typeof event.data.requestId !== "string" ||
      event.data.requestId.length > 100
    )
      return;
    const reply = (data: unknown) =>
      window.parent.postMessage(
        {
          channel: "uandup-calculator",
          version: 1,
          requestId: event.data.requestId,
          ...(data as object),
        },
        target!,
      );
    try {
      switch (event.data.type) {
        case "getState":
          reply({ type: "state", state: api.getState() });
          break;
        case "setState":
          api.setState(validateState(event.data.state));
          reply({ type: "ack" });
          break;
        case "reset":
          api.reset();
          reply({ type: "ack" });
          break;
        case "focus":
          api.focus();
          reply({ type: "ack" });
          break;
        default:
          reply({ type: "error", error: "Unknown message type." });
      }
    } catch (e) {
      reply({
        type: "error",
        error: e instanceof Error ? e.message : "Invalid request.",
      });
    }
  };
  window.addEventListener("message", listener);
  if (target && window.parent !== window)
    window.parent.postMessage(
      { channel: "uandup-calculator", version: 1, type: "ready" },
      target,
    );
  return () => window.removeEventListener("message", listener);
}
