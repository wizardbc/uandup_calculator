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
  type Viewport,
} from "./types";
import { EngineClient } from "./engine/client";
import { MathField, type MathAPI } from "./components/MathField";
import { ExpressionRow } from "./components/ExpressionRow";
import { Keypad, type KeyAction } from "./components/Keypad";
import { Settings } from "./components/Settings";
import { Icon } from "./components/Icons";
import { GraphCanvas, zoomViewport } from "./graph/GraphCanvas";
import { installEmbed, validateState } from "./state";

declare global {
  interface Window {
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
  const list = useRef<HTMLDivElement>(null);

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
    commit({ ...current.current, mode });
    setModeOpen(false);
    setSettingsOpen(false);
    setAddOpen(false);
    setActive(null);
    setScene(null);
    lastField.current = null;
  }
  function viewport(next: Viewport) {
    const s = current.current;
    commit({ ...s, graph: { ...s.graph, viewport: next } }, "viewport", false);
  }
  function home() {
    const v = current.current.graph.viewport;
    viewport({
      ...v,
      xMin: -10,
      xMax: 10,
      yMin: (-10 * v.height) / v.width,
      yMax: (10 * v.height) / v.width,
    });
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
      else if (action.value.includes("{}") || action.value.includes("[]"))
        api.keystroke("Left");
    } else if (action.type === "key") api.keystroke(action.value);
    else api.typedText(action.value);
  }
  useEffect(() => {
    engine.current = new EngineClient((value) => {
      setScene(value);
      setEngineError(null);
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
  useEffect(() => {
    const id = setTimeout(
      () => engine.current?.calculate(JSON.parse(inputKey)),
      24,
    );
    return () => clearTimeout(id);
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
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setAudio((v) => !v);
      }
      if (e.key === "Escape") {
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
  useEffect(() => {
    if (!audio || !scene) return;
    const row =
      scene.rows.find((r) => r.id === active && r.geometry.length) ??
      scene.rows.find((r) => r.geometry.length);
    const path = row?.geometry.find((g) => g.kind === "path");
    if (!path) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.035;
    const samples = Math.min(180, path.count / 2);
    const start = ctx.currentTime;
    for (let i = 0; i < samples; i++) {
      const y =
        scene.data[
          path.start + Math.floor(((i / samples) * path.count) / 2) * 2 + 1
        ];
      if (Number.isFinite(y))
        oscillator.frequency.setValueAtTime(
          Math.min(1600, Math.max(110, 440 * 2 ** (y / 10))),
          start + (i / samples) * 3,
        );
    }
    oscillator.start();
    oscillator.stop(start + 3);
    oscillator.onended = () => {
      void ctx.close();
      setAudio(false);
    };
    return () => {
      void ctx.close().catch(() => {});
    };
  }, [audio]);
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
    ? { ...state.graph.settings, degrees: state.scientific.degrees }
    : state.graph.settings;
  return (
    <div
      className={`calculator ${scientific ? "scientific-mode" : "graphing-mode"} ${settings.reverseContrast ? "reverse-contrast" : ""} ${settings.largeText ? "large-text" : ""} ${new URLSearchParams(location.search).get("embed") === "1" ? "embedded" : ""}`}
    >
      <header className="app-header">
        <a
          className="wordmark"
          aria-label="U and Up — licenses"
          href="./licenses.html"
          target="_blank"
          rel="noreferrer"
        >
          uandup
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
                      = {results.get(item.id)!.display}
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
              onSettings={() => setSettingsOpen(!settingsOpen)}
            />
            {settingsOpen && (
              <Settings
                scientific
                settings={settings}
                viewport={state.graph.viewport}
                onViewport={viewport}
                onSettings={(s) =>
                  commit({
                    ...state,
                    graph: {
                      ...state.graph,
                      settings: { ...s, degrees: state.graph.settings.degrees },
                    },
                    scientific: { ...state.scientific, degrees: s.degrees },
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
            { "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties
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
                    const at = active
                      ? Math.max(
                          0,
                          next.findIndex((i) => i.id === active),
                        )
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
                  key={item.id}
                  item={item}
                  index={index}
                  active={active === item.id}
                  result={results.get(item.id)}
                  editList={editList}
                  onChange={updateRow}
                  onSelect={() => {
                    select(item.id);
                    if (item.type === "expression")
                      lastField.current = fields.current.get(item.id) ?? null;
                  }}
                  onDelete={() => remove(item.id)}
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
            <div className="panel-brand" aria-label="U and Up calculator">
              <span>powered by</span>
              <a
                href="./licenses.html"
                target="_blank"
                rel="noreferrer"
                aria-label="Licenses and source"
              >
                <strong>uandup</strong>
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
                    Math.max(250, Math.min(window.innerWidth - 200, e.clientX)),
                  );
              }}
            />
          </aside>
          <div className="graph-region">
            <GraphCanvas
              viewport={state.graph.viewport}
              settings={state.graph.settings}
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
                  onClick={() =>
                    viewport(zoomViewport(state.graph.viewport, 0.8))
                  }
                >
                  <Icon name="plus" size={18} />
                </button>
                <button
                  aria-label="Zoom Out"
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
                settings={state.graph.settings}
                viewport={state.graph.viewport}
                onViewport={viewport}
                onSettings={(settings) =>
                  commit({ ...state, graph: { ...state.graph, settings } })
                }
              />
            )}
          </div>
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
          {keypad && (
            <Keypad
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
      {audio && (
        <div className="audio-status" role="status">
          Audio Trace <button onClick={() => setAudio(false)}>Stop</button>
        </div>
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
  );
}
