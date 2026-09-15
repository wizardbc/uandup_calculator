import { DEFAULT_SETTINGS, type CalculatorState, type Item } from "./types";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
      ["sliderMin", "sliderMax", "sliderStep", "lineWidth", "opacity"].every(
        (k) =>
          value[k] === undefined ||
          (typeof value[k] === "number" && Number.isFinite(value[k])),
      )
    );
  return (
    value.type === "table" &&
    Array.isArray(value.headers) &&
    value.headers.length === 2 &&
    value.headers.every((v) => typeof v === "string" && v.length <= 64) &&
    Array.isArray(value.values) &&
    value.values.length <= 2000 &&
    value.values.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        row.every((v) => typeof v === "string" && v.length <= 512),
    )
  );
}
export function validateState(value: unknown): CalculatorState {
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
    ![Number(v.xMax) - Number(v.xMin), Number(v.yMax) - Number(v.yMin)].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error("Invalid graph span.");
  if (!object(graph.settings) || typeof scientific.degrees !== "boolean")
    throw new Error("Invalid calculator settings.");
  for (const [key, expected] of Object.entries(DEFAULT_SETTINGS))
    if (
      typeof graph.settings[key] !== typeof expected ||
      (typeof graph.settings[key] === "string" &&
        String(graph.settings[key]).length > 100)
    )
      throw new Error("Invalid graph settings.");
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
