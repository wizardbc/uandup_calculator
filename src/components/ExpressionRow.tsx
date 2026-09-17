import { ThemeContext, visiblePlotColor } from "../theme";
import { RegressionResult } from "./RegressionResult";
import { Slider } from "./Slider";
import { ListResult } from "./ListResult";
import { TableRegression } from "./TableRegression";
import { useContext, useEffect, useRef, useState } from "react";
import {
  COLORS,
  type Expression,
  type Item,
  type RowResult,
  type Table,
} from "../types";
import { MathField, MathText, type MathAPI } from "./MathField";
import { Icon } from "./Icons";
import { InferenceResult } from "./InferenceResult";
import { StatisticsResult } from "./StatisticsResult";
import { VisualizationResult } from "./VisualizationResult";
import { resultLatex } from "./resultLatex";
import { ExpressionStyle } from "./ExpressionStyle";
import { DistributionResult } from "./DistributionResult";

export function ExpressionRow({
  item,
  index,
  active,
  result,
  editList,
  onChange,
  onSelect,
  onDelete,
  onEnter,
  onMove,
  onSliderCreate,
  register,
  onReorder,
  onExport,
  customColors = [],
  columnResults = [],
  computed = [],
  fitResult,
  onZoomFit,
  tablePointCounts = [],
}: {
  item: Item;
  index: number;
  active: boolean;
  result?: RowResult;
  editList: boolean;
  onChange: (item: Item) => void;
  onSelect: () => void;
  onDelete: () => void;
  onEnter: () => void;
  onMove: (direction: -1 | 1) => void;
  onSliderCreate: (names: string[]) => void;
  register: (id: string, api: MathAPI | null) => void;
  onReorder: (direction: -1 | 1) => void;
  onExport: (latex: string) => void;
  customColors?: { name: string; colors: string[] }[];
  columnResults?: (RowResult | undefined)[];
  computed?: boolean[];
  fitResult?: RowResult;
  onZoomFit?: () => void;
  tablePointCounts?: number[];
}) {
  const theme = useContext(ThemeContext);
  const [styleOpen, setStyleOpen] = useState(false);
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  const isGraph =
    !!result?.geometry.length ||
    item.type === "table" ||
    item.hidden ||
    [
      "graph",
      "function",
      "point",
      "tone",
      "distribution",
      "visualization",
    ].includes(result?.kind ?? "");
  return (
    <div
      className={`expression-row ${active ? "active" : ""} ${item.type === "table" ? "table-row" : ""} ${result?.error ? "has-error" : ""}`}
      data-expression-id={item.id}
    >
      <div className="expression-gutter" onClick={onSelect}>
        <span className="row-number">{index + 1}</span>
        {item.type === "table" && (
          <>
            <button
              className="table-add-regression"
              style={{
                display:
                  Math.max(0, ...tablePointCounts) >= 2 && !item.regression
                    ? undefined
                    : "none",
              }}
              aria-label="Add Regression"
              disabled={!!item.regression}
              onClick={() =>
                onChange({
                  ...item,
                  regression: {
                    model: "linear",
                    xColumn: 0,
                    yColumn: Math.max(
                      1,
                      tablePointCounts.findIndex((count) => count >= 2) + 1,
                    ),
                    color: "#6042a6",
                    hidden: false,
                    residualVariable: "",
                  },
                })
              }
            >
              <svg viewBox="0 0 24 24" width="23" height="23">
                <path d="M7 21 17 3" stroke="currentColor" strokeWidth="2.5" />
                <g fill="currentColor">
                  <circle cx="7" cy="11" r="2" />
                  <circle cx="17" cy="8" r="2" />
                  <circle cx="12" cy="17" r="2" />
                </g>
              </svg>
            </button>
            <button
              className="table-zoom-fit"
              style={{
                display:
                  Math.max(0, ...tablePointCounts) >= 1 ? undefined : "none",
              }}
              aria-label="Zoom Fit"
              onClick={onZoomFit}
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle
                  cx="10"
                  cy="10"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <path
                  d="m14 14 6 6M7 10h6M10 7v6"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </>
        )}
        {item.type !== "table" && (isGraph || result?.error) && (
          <button
            className={`expression-icon ${item.hidden ? "hidden-graph" : ""}`}
            style={{
              backgroundColor: result?.error
                ? "#c74440"
                : visiblePlotColor(
                    result?.strokeColors?.[0] ?? item.color,
                    theme,
                  ),
            }}
            aria-label={
              result?.error
                ? "Expression error"
                : result?.kind === "tone"
                  ? `${item.hidden ? "Unmute" : "Mute"} tone ${index + 1}`
                  : `${item.hidden ? "Show" : "Hide"} graph ${index + 1}`
            }
            title="Click to show or hide. Hold or right-click for style."
            onClick={(e) => {
              e.stopPropagation();
              if (held.current) {
                held.current = false;
                return;
              }
              if (!result?.error) onChange({ ...item, hidden: !item.hidden });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setStyleOpen(!styleOpen);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              held.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
              holdTimer.current = setTimeout(() => {
                held.current = true;
                setStyleOpen(true);
              }, 600);
            }}
            onPointerUp={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current);
            }}
            onPointerCancel={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current);
            }}
          >
            {result?.error ? (
              <Icon name="warning" size={22} />
            ) : result?.kind === "tone" ? (
              <Icon name="audio" size={23} />
            ) : result?.kind === "point" ||
              result?.geometry.some((g) => g.kind === "points") ? (
              <span
                className={`point-dots ${result?.kind === "point" && (item.type === "expression" ? (item.plotStyle?.dragMode ?? result.defaultDragMode ?? "none") : "none") === "none" ? "single-point" : ""}`}
              >
                {(item.type === "expression"
                  ? (item.plotStyle?.dragMode ??
                    result?.defaultDragMode ??
                    "none")
                  : "none") !== "none"
                  ? "✥"
                  : result?.kind === "point"
                    ? "●"
                    : "⠿"}
              </span>
            ) : (
              <Icon name="curve" size={24} />
            )}
          </button>
        )}
      </div>
      <div className="expression-content" onClick={onSelect}>
        {item.type === "expression" ? (
          <>
            <MathField
              latex={item.latex}
              label={`Expression ${index + 1}`}
              onChange={(latex) => onChange({ ...item, latex })}
              onFocus={onSelect}
              onEnter={onEnter}
              onMove={onMove}
              onEmptyBackspace={onDelete}
              register={(api) => register(item.id, api)}
            />
            {result?.error && (
              <div className="expression-error" role="status">
                {result.error}
              </div>
            )}
            {(result?.kind === "point" ||
              (result?.kind === "list" &&
                result.geometry.some((g) => g.kind === "points"))) && (
              <div className="point-label-row">
                <label>
                  <input
                    type="checkbox"
                    aria-label="Label visible"
                    checked={item.plotStyle?.showLabel ?? false}
                    onChange={(e) =>
                      onChange({
                        ...item,
                        plotStyle: {
                          ...item.plotStyle,
                          showLabel: e.target.checked,
                        },
                      })
                    }
                  />
                  {item.plotStyle?.showLabel ? "Label:" : "Label"}
                </label>
                {item.plotStyle?.showLabel && (
                  <input
                    aria-label="Point label"
                    value={item.plotStyle?.label ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...item,
                        plotStyle: { ...item.plotStyle, label: e.target.value },
                      })
                    }
                  />
                )}
              </div>
            )}
            {result?.domain && (
              <div className="curve-domain">
                <MathField
                  latex={item.domainMin ?? result.domain.min}
                  label={`domain ${result.domain.variable} Minimum`}
                  onChange={(domainMin) => onChange({ ...item, domainMin })}
                />
                <MathText
                  latex={`\\le ${result.domain.variable === "theta" ? "\\theta" : "t"}\\le`}
                />
                <MathField
                  latex={item.domainMax ?? result.domain.max}
                  label={`domain ${result.domain.variable} Maximum`}
                  onChange={(domainMax) => onChange({ ...item, domainMax })}
                />
              </div>
            )}
            {result?.inference && (
              <InferenceResult
                item={item}
                result={result}
                onChange={onChange}
                onExport={onExport}
              />
            )}
            {result?.statistics && (
              <StatisticsResult data={result.statistics} onExport={onExport} />
            )}
            {result?.visualization && (
              <VisualizationResult
                item={item}
                data={result.visualization}
                onChange={onChange}
              />
            )}
            {result?.distribution && (
              <DistributionResult
                item={item}
                data={result.distribution}
                onChange={onChange}
                onExport={onExport}
              />
            )}
            {!!result?.missing.length && (
              <div className="missing-variables">
                add slider:{" "}
                {result.missing.map((name) => (
                  <button
                    key={name}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSliderCreate([name]);
                    }}
                  >
                    {name}
                  </button>
                ))}
                {result.missing.length > 1 && (
                  <button onClick={() => onSliderCreate(result.missing)}>
                    all
                  </button>
                )}
              </div>
            )}
            {result?.display !== null &&
              result?.display !== undefined &&
              !result.error &&
              !result.slider &&
              !result.fit &&
              (result.kind === "list" ? (
                <ListResult result={result} />
              ) : (
                <div
                  className="expression-result"
                  aria-label={`Result ${result.display}`}
                >
                  {result.kind !== "list" && (
                    <span className="result-equals">
                      <MathText latex="=" />
                    </span>
                  )}
                  <span className="result-value">
                    <MathText latex={resultLatex(result.display)} />
                  </span>
                </div>
              ))}
            {result?.slider && (
              <Slider item={item} result={result} onChange={onChange} />
            )}
            {result?.fit && (
              <RegressionResult
                item={item}
                result={result}
                onChange={onChange}
                onExport={onExport}
              />
            )}
          </>
        ) : (
          <>
            <TableEditor
              pointCounts={tablePointCounts}
              columnResults={columnResults}
              computed={computed}
              customColors={customColors}
              item={item}
              onChange={onChange}
              onFocus={onSelect}
              register={register}
            />
            {item.regression && (
              <TableRegression
                item={item}
                result={fitResult}
                onChange={onChange}
                onExport={onExport}
              />
            )}
          </>
        )}
      </div>
      <button
        className="delete-expression"
        aria-label={`Delete Expression ${index + 1}`}
        onClick={onDelete}
      >
        <Icon name="close" size={23} />
      </button>
      {editList && (
        <div className="reorder-controls">
          <button
            aria-label={`Move expression ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onReorder(-1)}
          >
            ↑
          </button>
          <button
            aria-label={`Move expression ${index + 1} down`}
            onClick={() => onReorder(1)}
          >
            ↓
          </button>
          <button
            aria-label={`Style expression ${index + 1}`}
            onClick={() => setStyleOpen(!styleOpen)}
          >
            ●
          </button>
        </div>
      )}
      {styleOpen && item.type === "expression" && (
        <ExpressionStyle
          item={item}
          result={result}
          onChange={onChange}
          onClose={() => setStyleOpen(false)}
          customColors={customColors}
        />
      )}
    </div>
  );
}

function TableEditor({
  pointCounts,
  item,
  columnResults,
  computed,
  customColors,
  onChange,
  onFocus,
  register,
}: {
  item: Table;
  pointCounts: number[];
  columnResults: (RowResult | undefined)[];
  computed: boolean[];
  customColors: { name: string; colors: string[] }[];
  onChange: (item: Table) => void;
  onFocus: () => void;
  register: (id: string, api: MathAPI | null) => void;
}) {
  const theme = useContext(ThemeContext);
  const root = useRef<HTMLDivElement>(null);
  const [columnMenu, setColumnMenu] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ left: 94, top: 60 });
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHeld = useRef(false);
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );
  function openColumn(c: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect(),
      parent = root.current!.parentElement!.getBoundingClientRect();
    setAnchor({
      left: Math.max(
        0,
        Math.min(parent.width - 225, rect.left - parent.left - 4),
      ),
      top: rect.bottom - parent.top + 8,
    });
    setColumnMenu(c);
  }
  function addColumn() {
    if (item.headers.length >= 20) return;
    const suffix = /_\{?(\d+)/.exec(item.headers[0])?.[1] ?? "1";
    const existing = new Set(item.headers);
    let n = Number(suffix) + 1;
    while (existing.has(`y_${n}`)) n++;
    onChange({
      ...item,
      headers: [...item.headers, `y_${n}`],
      values: item.values.map((v) => [...v, ""]),
    });
  }
  const displayRows = Array.from(
    {
      length: Math.min(
        2000,
        Math.max(
          item.values.length,
          ...columnResults.map((r) => (r?.listValues?.length ?? 0) + 1),
        ),
      ),
    },
    (_, r) => item.headers.map((_, c) => item.values[r]?.[c] ?? ""),
  );
  const setCell = (row: number, col: number, value: string) => {
    const values = item.values.map((v) => [...v]);
    while (values.length <= row)
      values.push(Array(item.headers.length).fill(""));
    values[row][col] = value;
    if (values[values.length - 1].some(Boolean))
      values.push(Array(item.headers.length).fill(""));
    onChange({ ...item, values: values.slice(0, 2000) });
  };
  return (
    <>
      <div
        className="table-editor"
        ref={root}
        onPasteCapture={(e) => {
          const text = e.clipboardData.getData("text/plain");
          if (!text.includes("\t") && !text.includes("\n")) return;
          e.preventDefault();
          e.stopPropagation();
          const rows = text
            .trim()
            .split(/\r?\n/)
            .map((line) => line.split(/\t|,/).slice(0, 20));
          if (
            rows.length <= 2000 &&
            rows.every((r) => r.length >= 2 && r.every((c) => c.length < 512))
          ) {
            const count = Math.max(...rows.map((r) => r.length)),
              headers = [...item.headers.slice(0, count)];
            while (headers.length < count) headers.push(`y_${headers.length}`);
            onChange({
              ...item,
              headers,
              values: [
                ...rows.map((r) =>
                  Array.from({ length: count }, (_, i) => r[i] ?? ""),
                ),
                Array(count).fill(""),
              ],
            });
          }
        }}
      >
        <div className="table-header">
          {item.headers.map((header, c) => (
            <div
              key={c}
              className={`table-cell ${computed[c] ? "computed-column" : ""}`}
            >
              {c >= 1 && (
                <button
                  className="table-color"
                  style={{
                    background: visiblePlotColor(
                      item.columnColors?.[c] ??
                        (c === 1 ? item.color : COLORS[c % COLORS.length]),
                      theme,
                    ),
                    opacity: item.columnHidden?.[c]?.valueOf() ? 0.35 : 1,
                  }}
                  aria-label={
                    c === 1
                      ? "Toggle table points"
                      : `Toggle column ${c + 1} points`
                  }
                  onClick={() => {
                    if (wasHeld.current) {
                      wasHeld.current = false;
                      return;
                    }
                    const hidden = [...(item.columnHidden ?? [])];
                    hidden[c] = !hidden[c];
                    onChange({ ...item, columnHidden: hidden });
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    wasHeld.current = false;
                    const element = e.currentTarget;
                    hold.current = setTimeout(() => {
                      wasHeld.current = true;
                      openColumn(c, element);
                    }, 600);
                  }}
                  onPointerUp={() => {
                    if (hold.current) clearTimeout(hold.current);
                  }}
                  onPointerCancel={() => {
                    if (hold.current) clearTimeout(hold.current);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (columnMenu === c) setColumnMenu(null);
                    else openColumn(c, e.currentTarget);
                  }}
                >
                  <svg
                    viewBox="0 0 28 28"
                    width="28"
                    height="28"
                    aria-hidden="true"
                  >
                    <g fill="white">
                      <circle cx="9" cy="8" r="2.5" />
                      <circle cx="20" cy="8" r="2.5" />
                      <circle cx="15" cy="15" r="2.5" />
                      <circle cx="8" cy="21" r="2.5" />
                      <circle cx="21" cy="21" r="2.5" />
                    </g>
                  </svg>
                </button>
              )}
              <MathField
                latex={header}
                label={`Column ${c + 1} name`}
                onChange={(value) =>
                  onChange({
                    ...item,
                    headers: item.headers.map((h, i) => (i === c ? value : h)),
                  })
                }
                onFocus={onFocus}
                register={(api) => register(`${item.id}:header:${c}`, api)}
              />
            </div>
          ))}
          <button
            className="table-ghost add-table-column"
            aria-label="Add table column"
            onClick={addColumn}
          >
            +
          </button>
        </div>
        {displayRows.map((row, r) => (
          <div className="table-data-row" key={r}>
            {item.headers.map((_, c) => (
              <div
                className={`table-cell ${computed[c] ? "computed-cell computed-column" : ""}`}
                key={c}
              >
                {computed[c] ? (
                  <span
                    className="computed-table-value"
                    aria-label={`Table row ${r + 1} column ${c + 1}: ${columnResults[c]?.listValues?.[r] ?? ""}`}
                  >
                    <MathText
                      latex={resultLatex(
                        columnResults[c]?.listValues?.[r] ?? "",
                      )}
                    />
                  </span>
                ) : (
                  <MathField
                    latex={row[c] ?? ""}
                    label={`Table row ${r + 1} column ${c + 1}`}
                    onChange={(value) => setCell(r, c, value)}
                    onFocus={onFocus}
                    register={(api) => register(`${item.id}:${r}:${c}`, api)}
                    onEnter={() => {
                      const inputs =
                        root.current!.querySelectorAll<HTMLTextAreaElement>(
                          ".table-data-row textarea",
                        );
                      root.current
                        ?.querySelector<HTMLTextAreaElement>(
                          `textarea[aria-label="Table row ${r + 2} column ${c + 1}"]`,
                        )
                        ?.focus();
                    }}
                  />
                )}
              </div>
            ))}
            <div className="table-ghost" />
          </div>
        ))}
        <div className="table-fade-row">
          <span />
          <span />
          <span />
        </div>
      </div>
      {columnMenu !== null && (
        <div className="table-style-anchor" style={anchor}>
          <ExpressionStyle
            table
            customColors={customColors}
            item={{
              id: item.id,
              type: "expression",
              latex: "",
              hidden: false,
              color:
                item.columnColors?.[columnMenu] ??
                (columnMenu === 1
                  ? item.color
                  : COLORS[columnMenu % COLORS.length]),
              colorLatex: item.columnColorLatex?.[columnMenu],
              plotStyle: item.columnStyles?.[columnMenu],
            }}
            result={
              {
                ...columnResults[columnMenu],
                kind: "list",
                geometry: [
                  { kind: "points", start: 0, count: 0, dashed: false },
                ],
              } as RowResult
            }
            onClose={() => setColumnMenu(null)}
            onChange={(changed) => {
              const colors = [...(item.columnColors ?? [])],
                styles = [...(item.columnStyles ?? [])],
                colorLatex = [...(item.columnColorLatex ?? [])];
              colors[columnMenu] = changed.color;
              styles[columnMenu] = changed.plotStyle ?? {};
              colorLatex[columnMenu] = changed.colorLatex ?? "";
              onChange({
                ...item,
                columnColors: colors,
                columnStyles: styles,
                columnColorLatex: colorLatex,
              });
            }}
            onAddRegression={
              item.regression || (pointCounts[columnMenu - 1] ?? 0) < 2
                ? undefined
                : () => {
                    onChange({
                      ...item,
                      regression: {
                        model: "linear",
                        xColumn: 0,
                        yColumn: columnMenu,
                        color: "#6042a6",
                        hidden: false,
                        residualVariable: "",
                      },
                    });
                    setColumnMenu(null);
                  }
            }
          />
        </div>
      )}
    </>
  );
}
