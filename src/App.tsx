import { AudioTrace } from "./components/AudioTrace";
import { computedColumns, tableCoordinates } from "./engine/tables";
import { resultLatex } from "./components/resultLatex";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  COLORS,
  DEFAULT_SETTINGS,
  engineInput,
  expression,
  initialState,
  newId,
  type CalculatorState,
  type Expression,
  type Item,
  type Mode,
  type Scene,
  type GraphSettings,
  type Viewport,
} from "./types";
import { EngineClient } from "./engine/client";
import { TonePlayer } from "./engine/tones";
import { MathField, MathText, type MathAPI } from "./components/MathField";
import { ExpressionRow } from "./components/ExpressionRow";
import { Keypad, type KeyAction } from "./components/Keypad";
import { Settings } from "./components/Settings";
import { InferenceWizard } from "./components/InferenceWizard";
import { Icon } from "./components/Icons";
import { GraphCanvas, zoomViewport } from "./graph/GraphCanvas";
import { installEmbed, validateState } from "./state";
import { useTheme, ThemeContext } from "./theme";

declare global {
  interface Window {
    MathAICalculator: Window["UandupCalculator"];
    UandupCalculator: {
      getState(): CalculatorState;
      setState(state: unknown): void;
      reset(): void;
      getDiagnostics(): {
        ready: boolean;
        engine?: string;
        duration?: number;
        evaluations?: number;
        revision?: number;
        error: string | null;
      };
    };
  }
}
export default function App() {
  const { theme, followsSystem, changeTheme } = useTheme();
  const [state, setState] = useState<CalculatorState>(initialState);
  const current = useRef(state);
  current.current = state;
  const [scene, setScene] = useState<Scene | null>(null);
  const lastScene = useRef(scene);
  lastScene.current = scene;
  const [engineError, setEngineError] = useState<string | null>(null);
  const errorRef = useRef(engineError);
  errorRef.current = engineError;
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [keypad, setKeypad] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(417);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editList, setEditList] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [audio, setAudio] = useState(false);
  const [audioPoint, setAudioPoint] = useState<
    import("./types").Interest | null
  >(null);
  useEffect(() => {
    if (audio) setKeypad(false);
  }, [audio]);
  const [tonesEnabled, setTonesEnabled] = useState(false);
  const tonesRef = useRef(false),
    tonePlayer = useRef(new TonePlayer());
  function toggleTones() {
    const enabled = !tonesRef.current;
    tonesRef.current = enabled;
    tonePlayer.current.enable(enabled);
    setTonesEnabled(enabled);
  }
  const [inferenceId, setInferenceId] = useState<string | null>(null);
  const fields = useRef(new Map<string, MathAPI>());
  const lastField = useRef<MathAPI | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const history = useRef<CalculatorState[]>([]),
    future = useRef<CalculatorState[]>([]);
  const lastEdit = useRef({ key: "", time: 0 });
  const [, updateHistory] = useState(0);
  const engine = useRef<EngineClient | null>(null);
  const scientific = state.mode === "scientific";
  const items = scientific ? state.scientific.items : state.graph.items;
  const results = new Map(scene?.rows.map((row) => [row.id, row]));
  const tableData = new Map(
    state.graph.items
      .filter((item) => item.type === "table")
      .map((table) => [
        table.id,
        tableCoordinates(
          table.headers.map((_, c) => results.get(`${table.id}-col-${c}`)),
        ),
      ]),
  );
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tones = scientific
      ? []
      : (scene?.rows ?? [])
          .filter(
            (row) => !state.graph.items.find((i) => i.id === row.id)?.hidden,
          )
          .flatMap((row) =>
            (row.tones ?? []).map(([frequency, gain], i) => ({
              id: `${row.id}:${i}`,
              frequency,
              gain,
            })),
          );
    tonePlayer.current.update(tones);
  }, [scene, tonesEnabled, state.mode, state.graph.items]);
  useEffect(() => () => tonePlayer.current.close(), []);

  function commit(next: CalculatorState, key = "", record = true) {
    const now = performance.now();
    if (
      record &&
      (!key ||
        lastEdit.current.key !== key ||
        now - lastEdit.current.time > 700)
    ) {
      history.current.push(current.current);
      if (history.current.length > 100) history.current.shift();
    }
    if (record) {
      future.current = [];
      lastEdit.current = { key, time: now };
    }
    current.current = next;
    setState(next);
  }
  function changeItems(next: Item[], key = "") {
    const s = current.current;
    commit(
      s.mode === "scientific"
        ? { ...s, scientific: { ...s.scientific, items: next as Expression[] } }
        : { ...s, graph: { ...s.graph, items: next } },
      key,
    );
  }
  function focus(id: string) {
    pendingFocus.current = id;
    setActive(id.split(":")[0]);
  }
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id) {
      const api = fields.current.get(id);
      if (api) {
        pendingFocus.current = null;
        api.focus();
        lastField.current = api;
        document
          .querySelector(`[data-expression-id="${id.split(":")[0]}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }
    }
  });
  function select(id: string) {
    setActive(id);
    setAddOpen(false);
    setSettingsOpen(false);
  }
  function addExpression(afterId?: string) {
    const s = current.current,
      list = s.mode === "scientific" ? s.scientific.items : s.graph.items;
    if (list.length >= 100) return;
    const row = expression(list.length);
    const next = [...list];
    const index = afterId
      ? next.findIndex((r) => r.id === afterId) + 1
      : next.length;
    next.splice(index, 0, row);
    changeItems(next);
    focus(row.id);
    setAddOpen(false);
  }
  function enter(id: string) {
    const s = current.current,
      rows = s.mode === "scientific" ? s.scientific.items : s.graph.items;
    const at = rows.findIndex((r) => r.id === id),
      row = rows[at];
    if (row?.type === "expression" && !row.latex) {
      focus(id);
      return;
    }
    if (
      rows[at + 1]?.type === "expression" &&
      !(rows[at + 1] as Expression).latex
    )
      focus(rows[at + 1].id);
    else addExpression(id);
  }
  function remove(id: string) {
    const s = current.current,
      rows = s.mode === "scientific" ? s.scientific.items : s.graph.items;
    const at = rows.findIndex((r) => r.id === id);
    const next = rows.filter((r) => r.id !== id);
    if (!next.length) next.push(expression());
    changeItems(next);
    if (activeRef.current === id) focus(next[Math.max(0, at - 1)].id);
  }
  function undo() {
    const previous = history.current.pop();
    if (previous) {
      future.current.push(current.current);
      current.current = previous;
      setState(previous);
      lastEdit.current.key = "";
      updateHistory((v) => v + 1);
    }
  }
  function redo() {
    const next = future.current.pop();
    if (next) {
      history.current.push(current.current);
      current.current = next;
      setState(next);
      lastEdit.current.key = "";
      updateHistory((v) => v + 1);
    }
  }
  function reset() {
    const next = initialState();
    next.mode = current.current.mode;
    commit(next);
    setActive(null);
    setScene(null);
    setEngineError(null);
    setClearOpen(false);
  }
  function changeMode(mode: Mode) {
    setInferenceId(null);
    commit({ ...current.current, mode });
    setModeOpen(false);
    setSettingsOpen(false);
    setAddOpen(false);
    setActive(null);
    setScene(null);
    lastField.current = null;
  }
  function viewport(next: Viewport, preserveLatex = false) {
    const s = current.current;
    if (
      !preserveLatex &&
      ["xMin", "xMax", "yMin", "yMax"].some(
        (key) =>
          next[key as keyof Viewport] !==
          s.graph.viewport[key as keyof Viewport],
      )
    )
      next = { ...next, boundsLatex: undefined };
    commit({ ...s, graph: { ...s.graph, viewport: next } }, "viewport", false);
  }
  function home() {
    const v = current.current.graph.viewport;
    viewport({
      ...v,
      xMin: v.xLog ? 0.001 : -10,
      xMax: v.xLog ? 1000 : 10,
      yMin: v.yLog ? 0.001 : (-10 * v.height) / v.width,
      yMax: v.yLog ? 1000 : (10 * v.height) / v.width,
    });
  }
  function graphSettings(settings: GraphSettings) {
    const s = current.current;
    const v = { ...s.graph.viewport };
    for (const axis of ["x", "y"] as const) {
      if (settings[`${axis}Log`] !== s.graph.settings[`${axis}Log`]) {
        v[`${axis}Log`] = settings[`${axis}Log`];
        if (settings[`${axis}Log`] && v[`${axis}Min`] <= 0) {
          v[`${axis}Min`] = 0.001;
          v[`${axis}Max`] = 1000;
        }
      }
    }
    commit({ ...s, graph: { ...s.graph, settings, viewport: v } });
  }
  function onKey(action: KeyAction) {
    if (action.type === "audio") {
      setAudio(!audio);
      return;
    }
    const s = current.current,
      rows = s.mode === "scientific" ? s.scientific.items : s.graph.items;
    let api =
      lastField.current ??
      fields.current.get(activeRef.current ?? "") ??
      fields.current.get(rows[0].id);
    if (api && !api.el().isConnected) api = fields.current.get(rows[0].id);
    if (!api) {
      addExpression();
      return;
    }
    api.focus();
    lastField.current = api;
    if (action.type === "latex") {
      api.write(action.value);
      if (action.value === "\\frac{}{}" || action.value === "\\sqrt[]{}")
        api.keystroke("Left Up");
      else if (action.value === "\\log_{}\\left(\\right)")
        api.keystroke("Left Left Down");
      else if (
        ["\\int_{}^{}", "\\sum_{}^{}", "\\prod_{}^{}"].includes(action.value)
      )
        api.keystroke("Left Down");
      else if (action.value.endsWith("\\left(\\right)")) api.keystroke("Left");
      else if (action.value.includes("{}") || action.value.includes("[]"))
        api.keystroke("Left");
    } else if (action.type === "key") api.keystroke(action.value);
    else api.typedText(action.value);
  }
  useLayoutEffect(() => {
    engine.current = new EngineClient((value, evaluated) => {
      setScene(value);
      setEngineError(null);
      const s = current.current;
      if (
        s.mode !== "graphing" ||
        JSON.stringify(engineInput(s)) !== JSON.stringify(evaluated)
      )
        return;
      const rows = new Map(value.rows.map((row) => [row.id, row]));
      let changed = false;
      const items = s.graph.items.map((item) => {
        const name = rows.get(
          item.type === "table" ? `${item.id}:regression` : item.id,
        )?.residualVariable;
        if (!name) return item;
        if (item.type === "expression" && !item.residualVariable) {
          changed = true;
          return { ...item, residualVariable: name };
        }
        if (
          item.type === "table" &&
          item.regression &&
          !item.regression.residualVariable
        ) {
          changed = true;
          return {
            ...item,
            regression: { ...item.regression, residualVariable: name },
          };
        }
        return item;
      });
      let v = { ...s.graph.viewport };
      for (const key of ["xMin", "xMax", "yMin", "yMax"] as const) {
        const n = rows.get(`__viewport-${key}`)?.value;
        if (typeof n === "number" && Number.isFinite(n)) v[key] = n;
      }
      const valid =
        v.xMin < v.xMax &&
        v.yMin < v.yMax &&
        (!v.xLog || v.xMin > 0) &&
        (!v.yLog || v.yMin > 0);
      if (!valid) v = s.graph.viewport;
      else
        changed ||= ["xMin", "xMax", "yMin", "yMax"].some(
          (key) =>
            v[key as keyof Viewport] !==
            s.graph.viewport[key as keyof Viewport],
        );
      if (changed)
        commit(
          { ...s, graph: { ...s.graph, items, viewport: v } },
          "derived",
          false,
        );
    }, setEngineError);
    return () => engine.current?.stop();
  }, []);
  useEffect(() => {
    const focused = (event: FocusEvent) => {
      for (const api of fields.current.values())
        if (api.el().contains(event.target as Node)) {
          lastField.current = api;
          break;
        }
    };
    document.addEventListener("focusin", focused);
    return () => document.removeEventListener("focusin", focused);
  }, []);
  const inputKey = JSON.stringify(engineInput(state));
  useLayoutEffect(() => {
    // Dispatch before paint; EngineClient already keeps only the newest
    // pending input while a calculation is in flight.
    engine.current?.calculate(JSON.parse(inputKey));
  }, [inputKey]);
  useEffect(() => {
    const api = {
      getState: () =>
        JSON.parse(JSON.stringify(current.current)) as CalculatorState,
      setState: (s: unknown) => {
        const parsed = validateState(s);
        commit(parsed);
        setActive(null);
        setScene(null);
      },
      reset,
      focus: () =>
        focus(
          (current.current.mode === "scientific"
            ? current.current.scientific.items
            : current.current.graph.items)[0].id,
        ),
    };
    window.UandupCalculator = {
      ...api,
      getDiagnostics: () => ({
        ready: !!lastScene.current,
        engine: lastScene.current?.engine,
        duration: lastScene.current?.duration,
        evaluations: lastScene.current?.evaluations,
        revision: lastScene.current?.revision,
        error: errorRef.current,
      }),
    };
    window.MathAICalculator = window.UandupCalculator;
    return installEmbed(api);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if (
        e.altKey &&
        e.key.toLowerCase() === "t" &&
        current.current.mode === "graphing"
      ) {
        e.preventDefault();
        setAudio((v) => !v);
      }
      if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleTones();
      }
      if (e.key === "Escape") {
        setInferenceId(null);
        setSettingsOpen(false);
        setAddOpen(false);
        setModeOpen(false);
        setAudio(false);
        setClearOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const updateRow = (row: Item) => {
    const s = current.current;
    const list = s.mode === "scientific" ? s.scientific.items : s.graph.items;
    changeItems(
      list.map((r) => (r.id === row.id ? row : r)),
      row.id,
    );
  };
  const register = (id: string, api: MathAPI | null) => {
    if (api) fields.current.set(id, api);
    else fields.current.delete(id);
  };
  const settings = scientific
    ? {
        ...state.graph.settings,
        degrees: state.scientific.degrees,
        complex: state.scientific.complex,
      }
    : state.graph.settings;
  return (
    <ThemeContext.Provider value={theme}>
      <div
        data-theme={theme}
        className={`calculator ${scientific ? "scientific-mode" : "graphing-mode"} ${settings.largeText ? "large-text" : ""} ${new URLSearchParams(location.search).get("embed") === "1" ? "embedded" : ""}`}
      >
        <header className="app-header">
          <a
            className="wordmark"
            aria-label="About MathAI — WebAssembly, licenses and source"
            href="./licenses.html"
            target="_blank"
            rel="noreferrer"
          >
            <img src="./mathai-logo.png" alt="MathAI" />
          </a>
          <span className="header-divider" />
          <div className="mode-switch">
            <button
              onClick={() => setModeOpen(!modeOpen)}
              aria-label="Switch calculator"
              aria-expanded={modeOpen}
            >
              {scientific ? "Scientific Calculator" : "Graphing Calculator"}
              <span className="mode-chevron">⌄</span>
            </button>
            {modeOpen && (
              <div className="mode-menu popover">
                <button onClick={() => changeMode("graphing")}>
                  <Icon name="curve" size={19} />
                  Graphing Calculator{!scientific && " ✓"}
                </button>
                <button onClick={() => changeMode("scientific")}>
                  <Icon name="keyboard" size={19} />
                  Scientific Calculator{scientific && " ✓"}
                </button>
              </div>
            )}
          </div>
          <span className="header-divider" />
          <span className="exam-label">Test Practice</span>
        </header>
        {scientific ? (
          <main className="scientific-container">
            <div className="scientific-calculator">
              <div className="scientific-display" ref={list}>
                <div className="scientific-history-spacer" />
                {state.scientific.items.map((item, index) => (
                  <div
                    key={item.id}
                    data-expression-id={item.id}
                    className={`scientific-expression ${active === item.id ? "active" : ""}`}
                    onClick={() => focus(item.id)}
                  >
                    <MathField
                      latex={item.latex}
                      label={`Expression ${index + 1}`}
                      onChange={(latex) => updateRow({ ...item, latex })}
                      onFocus={() => {
                        select(item.id);
                        lastField.current = fields.current.get(item.id) ?? null;
                      }}
                      onEnter={() => enter(item.id)}
                      onMove={(d) => {
                        const row = items[index + d];
                        if (row) focus(row.id);
                      }}
                      onEmptyBackspace={() => {
                        if (index > 0) remove(item.id);
                      }}
                      register={(api) => register(item.id, api)}
                    />
                    {results.get(item.id)?.display && (
                      <span
                        className="scientific-answer"
                        aria-label={`Result ${results.get(item.id)!.display}`}
                      >
                        <MathText
                          latex={`=${resultLatex(results.get(item.id)!.display!)}`}
                        />
                      </span>
                    )}
                    {results.get(item.id)?.error && (
                      <span className="scientific-error" role="status">
                        {results.get(item.id)!.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Keypad
                scientific
                complex={settings.complex}
                onKey={onKey}
                degrees={state.scientific.degrees}
                onDegrees={(degrees) =>
                  commit({
                    ...state,
                    scientific: { ...state.scientific, degrees },
                  })
                }
                canUndo={history.current.length > 0}
                canRedo={future.current.length > 0}
                onUndo={undo}
                onRedo={redo}
                onClear={() => setClearOpen(true)}
                canClear={state.scientific.items.some((item) =>
                  item.latex.trim(),
                )}
                settingsOpen={settingsOpen}
                onSettings={() => setSettingsOpen(!settingsOpen)}
              />
              {settingsOpen && (
                <Settings
                  theme={theme}
                  followsSystem={followsSystem}
                  onTheme={changeTheme}
                  expressions={engineInput(state).expressions}
                  scientific
                  settings={settings}
                  viewport={state.graph.viewport}
                  onViewport={(next) => viewport(next, true)}
                  onSettings={(s) =>
                    commit({
                      ...state,
                      graph: {
                        ...state.graph,
                        settings: {
                          ...s,
                          degrees: state.graph.settings.degrees,
                          complex: state.graph.settings.complex,
                        },
                      },
                      scientific: {
                        ...state.scientific,
                        degrees: s.degrees,
                        complex: s.complex,
                      },
                    })
                  }
                />
              )}
            </div>
          </main>
        ) : (
          <main
            className={`graphing-container ${collapsed ? "list-collapsed" : ""} ${keypad ? "keypad-visible" : ""}`}
            style={
              {
                "--sidebar-width": `${sidebarWidth}px`,
              } as React.CSSProperties
            }
          >
            <aside className="expression-panel" aria-label="Expressions">
              <div className="expression-toolbar">
                <button
                  aria-label="Add Item"
                  className={addOpen ? "pressed" : ""}
                  onClick={() => {
                    setAddOpen(!addOpen);
                    setSettingsOpen(false);
                  }}
                >
                  <Icon name="plus" />
                </button>
                <div className="undo-tools">
                  <button
                    aria-label="Undo"
                    disabled={!history.current.length}
                    onClick={undo}
                  >
                    <Icon name="undo" />
                  </button>
                  <button
                    aria-label="Redo"
                    disabled={!future.current.length}
                    onClick={redo}
                  >
                    <Icon name="redo" />
                  </button>
                </div>
                <div className="list-tools">
                  {state.graph.items.some(
                    (item) =>
                      item.type === "expression" &&
                      /random|shuffle/.test(item.latex),
                  ) && (
                    <button
                      aria-label="Randomize"
                      title="Randomize"
                      onClick={() =>
                        commit({
                          ...state,
                          graph: {
                            ...state.graph,
                            randomSeed:
                              ((state.graph.randomSeed ?? 0) + 1) >>> 0,
                          },
                        })
                      }
                    >
                      <span className="randomize-icon">⚄</span>
                    </button>
                  )}
                  {scene?.rows.some((row) => row.tones?.length) && (
                    <button
                      aria-label={tonesEnabled ? "Mute All" : "Unmute All"}
                      title={tonesEnabled ? "Mute All" : "Unmute All"}
                      onClick={toggleTones}
                    >
                      <Icon name="audio" size={21} />
                      {!tonesEnabled && <span className="mute-slash">╱</span>}
                    </button>
                  )}
                  <button
                    aria-label="Edit Expression List"
                    className={editList ? "pressed" : ""}
                    onClick={() => setEditList(!editList)}
                  >
                    <Icon name="gear" size={19} />
                  </button>
                  <button
                    aria-label="Hide Expression List"
                    onClick={() => setCollapsed(true)}
                  >
                    <Icon name="collapse" size={22} />
                  </button>
                </div>
              </div>
              {addOpen && (
                <div className="add-menu popover">
                  <button onClick={() => addExpression(active ?? undefined)}>
                    <span className="math-icon">ƒ(x)</span>expression
                  </button>
                  <button
                    onClick={() => {
                      const n =
                        state.graph.items.filter((i) => i.type === "table")
                          .length + 1;
                      const table: Item = {
                        id: newId(),
                        type: "table",
                        color: COLORS[2],
                        hidden: false,
                        headers: [`x_${n}`, `y_${n}`],
                        values: [["", ""]],
                      };
                      const next = [...state.graph.items];
                      const empty = next.findIndex(
                        (item) =>
                          item.type === "expression" && !item.latex.trim(),
                      );
                      const at = active
                        ? Math.max(
                            0,
                            next.findIndex((i) => i.id === active),
                          )
                        : empty >= 0
                          ? empty
                          : next.length;
                      next.splice(at, 0, table);
                      changeItems(next);
                      setAddOpen(false);
                      setKeypad(true);
                      focus(`${table.id}:0:0`);
                    }}
                  >
                    <Icon name="table" size={25} />
                    table
                  </button>
                  <button
                    onClick={() => {
                      const next = [...state.graph.items];
                      let row =
                        next.find(
                          (i) =>
                            i.id === active &&
                            i.type === "expression" &&
                            !i.latex,
                        ) ??
                        next.find((i) => i.type === "expression" && !i.latex);
                      if (!row) {
                        row = expression(next.length);
                        next.push(row);
                      }
                      if (next[next.length - 1].id === row.id)
                        next.push(expression(next.length));
                      changeItems(next);
                      setActive(row.id);
                      setInferenceId(row.id);
                      setAddOpen(false);
                      setKeypad(false);
                    }}
                  >
                    <span className="math-icon">χ²</span>inference
                  </button>
                </div>
              )}
              {editList && (
                <div className="edit-list-bar">
                  <button onClick={() => setClearOpen(true)}>Delete All</button>
                  <button onClick={() => setEditList(false)}>Done</button>
                </div>
              )}
              <div className="expression-list" ref={list}>
                {state.graph.items.map((item, index) => (
                  <ExpressionRow
                    tablePointCounts={(tableData.get(item.id) ?? []).map(
                      (points) => points.length,
                    )}
                    fitResult={results.get(`${item.id}:regression`)}
                    onZoomFit={() => {
                      const points = (tableData.get(item.id) ?? []).flat();
                      if (!points.length) return;
                      const xs = points.map((p) => p[0]),
                        ys = points.map((p) => p[1]);
                      const lo = Math.min(...xs),
                        hi = Math.max(...xs),
                        bottom = Math.min(...ys),
                        top = Math.max(...ys);
                      const dx = Math.max(1, hi - lo) * 0.1,
                        dy = Math.max(1, top - bottom) * 0.1;
                      viewport({
                        ...state.graph.viewport,
                        xMin: lo - dx,
                        xMax: hi + dx,
                        yMin: bottom - dy,
                        yMax: top + dy,
                      });
                    }}
                    computed={
                      item.type === "table"
                        ? computedColumns(item, state.graph.items)
                        : []
                    }
                    columnResults={
                      item.type === "table"
                        ? item.headers.map((_, c) =>
                            results.get(`${item.id}-col-${c}`),
                          )
                        : []
                    }
                    key={item.id}
                    item={item}
                    index={index}
                    active={active === item.id}
                    result={results.get(item.id)}
                    customColors={(scene?.rows ?? [])
                      .filter((row) => row.colorName && row.colors?.length)
                      .map((row) => ({
                        name: row.colorName!,
                        colors: row.colors!,
                      }))}
                    editList={editList}
                    onChange={updateRow}
                    onSelect={() => {
                      select(item.id);
                      if (item.type === "expression")
                        lastField.current = fields.current.get(item.id) ?? null;
                    }}
                    onDelete={() => remove(item.id)}
                    onExport={(latex) =>
                      changeItems([
                        ...state.graph.items,
                        expression(state.graph.items.length, latex),
                      ])
                    }
                    onEnter={() => enter(item.id)}
                    onMove={(d) => {
                      const row = state.graph.items[index + d];
                      if (row) focus(row.id);
                    }}
                    register={register}
                    onSliderCreate={(names) => {
                      const next = [...state.graph.items];
                      for (const name of names)
                        next.push(expression(next.length, `${name}=1`));
                      changeItems(next);
                    }}
                    onReorder={(direction) => {
                      const next = [...state.graph.items];
                      const to = index + direction;
                      if (to < 0 || to >= next.length) return;
                      [next[index], next[to]] = [next[to], next[index]];
                      changeItems(next);
                    }}
                  />
                ))}
                <button
                  className="new-expression-row"
                  aria-label="Add expression"
                  onClick={() => addExpression()}
                >
                  <span>{state.graph.items.length + 1}</span>
                </button>
              </div>
              <div className="panel-brand" aria-label="MathAI calculator">
                <span>powered by</span>
                <a
                  href="./licenses.html"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="About MathAI — WebAssembly, licenses and source"
                >
                  <img src="./mathai-logo.png" alt="MathAI" />
                </a>
              </div>
              <div
                className="panel-resizer"
                role="separator"
                aria-label="Resize expression list"
                aria-orientation="vertical"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight")
                    setSidebarWidth((w) =>
                      Math.max(
                        250,
                        Math.min(
                          innerWidth - 200,
                          w + (e.key === "ArrowLeft" ? -10 : 10),
                        ),
                      ),
                    );
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    setSidebarWidth(
                      Math.max(
                        250,
                        Math.min(window.innerWidth - 200, e.clientX),
                      ),
                    );
                }}
              />
            </aside>
            <div className="graph-region">
              <GraphCanvas
                theme={theme}
                audioPoint={audio ? audioPoint : null}
                onItems={(items) => changeItems(items, "point-drag")}
                viewport={state.graph.viewport}
                settings={{
                  ...state.graph.settings,
                  xStep: String(
                    results.get("__step-x")?.value ??
                      state.graph.settings.xStep,
                  ),
                  yStep: String(
                    results.get("__step-y")?.value ??
                      state.graph.settings.yStep,
                  ),
                }}
                scene={scene}
                items={state.graph.items}
                active={active}
                onViewport={viewport}
                onSelect={setActive}
                onInteract={() => {
                  setSettingsOpen(false);
                  setAddOpen(false);
                }}
              />
              {collapsed && (
                <button
                  className="show-expression-list graph-tool"
                  aria-label="Show Expression List"
                  onClick={() => setCollapsed(false)}
                >
                  <Icon name="expand" />
                </button>
              )}
              <div className="graph-controls">
                <button
                  className={`graph-tool ${settingsOpen ? "pressed" : ""}`}
                  aria-label="Graph Settings"
                  onClick={() => {
                    setSettingsOpen(!settingsOpen);
                    setActive(null);
                    setKeypad(false);
                    setAddOpen(false);
                  }}
                >
                  <Icon name="wrench" size={20} />
                </button>
                <div className="zoom-tools">
                  <button
                    aria-label="Zoom In"
                    disabled={settings.lockViewport}
                    onClick={() =>
                      viewport(zoomViewport(state.graph.viewport, 0.8))
                    }
                  >
                    <Icon name="plus" size={18} />
                  </button>
                  <button
                    aria-label="Zoom Out"
                    disabled={settings.lockViewport}
                    onClick={() =>
                      viewport(zoomViewport(state.graph.viewport, 1.25))
                    }
                  >
                    <Icon name="minus" size={18} />
                  </button>
                </div>
                {Math.abs(state.graph.viewport.xMin + 10) > 0.001 ||
                Math.abs(state.graph.viewport.xMax - 10) > 0.001 ? (
                  <button
                    className="graph-tool"
                    aria-label="Default View"
                    onClick={home}
                  >
                    <Icon name="home" size={20} />
                  </button>
                ) : null}
              </div>
              {settingsOpen && (
                <Settings
                  theme={theme}
                  followsSystem={followsSystem}
                  onTheme={changeTheme}
                  expressions={engineInput(state).expressions}
                  settings={state.graph.settings}
                  viewport={state.graph.viewport}
                  onViewport={(next) => viewport(next, true)}
                  onSettings={graphSettings}
                />
              )}
            </div>
            {inferenceId && (
              <InferenceWizard
                onClose={() => setInferenceId(null)}
                onFocus={(api) => {
                  lastField.current = api;
                }}
                onCreate={(latex) => {
                  const row = state.graph.items.find(
                    (i) => i.id === inferenceId,
                  );
                  if (row?.type === "expression") updateRow({ ...row, latex });
                  setInferenceId(null);
                  lastField.current = null;
                }}
              />
            )}
            <button
              className={`keypad-toggle ${keypad ? "open" : ""}`}
              aria-label={keypad ? "Hide Keypad" : "Show Keypad"}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setKeypad(!keypad);
                setSettingsOpen(false);
                if (!active) focus(state.graph.items[0].id);
              }}
            >
              <Icon name="keyboard" size={27} />
              <Icon name={keypad ? "down" : "up"} size={16} />
            </button>
            {keypad && !audio && (
              <Keypad
                complex={settings.complex}
                onKey={onKey}
                degrees={state.graph.settings.degrees}
                onDegrees={(degrees) =>
                  commit({
                    ...state,
                    graph: {
                      ...state.graph,
                      settings: { ...state.graph.settings, degrees },
                    },
                  })
                }
              />
            )}
          </main>
        )}
        {engineError && (
          <div className="engine-error" role="alert">
            {engineError}
            <button
              aria-label="Dismiss calculation error"
              onClick={() => setEngineError(null)}
            >
              ×
            </button>
          </div>
        )}
        {audio && !scientific && (
          <AudioTrace
            scene={scene}
            items={state.graph.items}
            active={active}
            viewport={state.graph.viewport}
            onSelect={setActive}
            onTrace={setAudioPoint}
            onClose={() => {
              setAudio(false);
              setAudioPoint(null);
              if (activeRef.current) focus(activeRef.current);
            }}
            onItems={(items) => changeItems(items, "audio-slider")}
          />
        )}
        {clearOpen && (
          <div className="modal-backdrop">
            <div
              className="clear-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Clear calculator"
            >
              <h2>Clear all expressions?</h2>
              <p>This clears the current calculator.</p>
              <div>
                <button onClick={() => setClearOpen(false)}>Cancel</button>
                <button
                  className="primary"
                  onClick={() => {
                    changeItems([expression()]);
                    setActive(null);
                    setClearOpen(false);
                  }}
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeContext.Provider>
  );
}
