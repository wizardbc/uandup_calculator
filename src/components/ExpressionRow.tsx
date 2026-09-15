import { useEffect, useRef, useState } from "react";
import {
  COLORS,
  type Expression,
  type Item,
  type RowResult,
  type Table,
} from "../types";
import { MathField, MathText, type MathAPI } from "./MathField";
import { Icon } from "./Icons";

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
}) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sliderSettings, setSliderSettings] = useState(false);
  const lastItem = useRef(item);
  lastItem.current = item;
  useEffect(() => {
    if (!playing || item.type !== "expression" || !result?.slider) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      if (now - last >= 65) {
        const current = lastItem.current as Expression;
        const lo = current.sliderMin ?? -10,
          hi = current.sliderMax ?? 10,
          step = current.sliderStep ?? 0.1;
        const previous = Number(current.latex.split("=")[1]) || 0;
        const value = previous + step > hi ? lo : previous + step;
        onChange({
          ...current,
          latex: `${result.slider}=${Number(value.toFixed(8))}`,
        });
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, result?.slider]);
  const isGraph =
    !!result?.geometry.length ||
    item.type === "table" ||
    item.hidden ||
    ["graph", "function", "point"].includes(result?.kind ?? "");
  return (
    <div
      className={`expression-row ${active ? "active" : ""} ${item.type === "table" ? "table-row" : ""} ${result?.error ? "has-error" : ""}`}
      data-expression-id={item.id}
    >
      <div className="expression-gutter" onClick={onSelect}>
        <span className="row-number">{index + 1}</span>
        {(isGraph || result?.error) && (
          <button
            className={`expression-icon ${item.hidden ? "hidden-graph" : ""}`}
            style={{ backgroundColor: result?.error ? "#c74440" : item.color }}
            aria-label={
              result?.error
                ? "Expression error"
                : `${item.hidden ? "Show" : "Hide"} graph ${index + 1}`
            }
            title="Click to show or hide. Hold or right-click for style."
            onClick={(e) => {
              e.stopPropagation();
              if (!result?.error) onChange({ ...item, hidden: !item.hidden });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setStyleOpen(!styleOpen);
            }}
            onPointerDown={(e) => {
              if (e.button === 0) {
                const id = setTimeout(() => setStyleOpen(true), 600);
                const clear = () => {
                  clearTimeout(id);
                  window.removeEventListener("pointerup", clear);
                };
                window.addEventListener("pointerup", clear);
              }
            }}
          >
            {result?.error ? (
              <Icon name="warning" size={22} />
            ) : item.type === "table" || result?.kind === "point" ? (
              <span className="point-dots">⠿</span>
            ) : (
              <Icon name="curve" size={24} />
            )}
          </button>
        )}
        {result?.slider && (
          <button
            className="slider-play"
            aria-label={playing ? "Pause slider" : "Play slider"}
            onClick={() => setPlaying(!playing)}
          >
            <Icon name={playing ? "pause" : "play"} size={16} />
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
              !result.fit && (
                <div
                  className="expression-result"
                  aria-label={`Result ${result.display}`}
                >
                  <span>
                    {result.kind === "list"
                      ? result.display
                      : `= ${result.display}`}
                  </span>
                </div>
              )}
            {result?.slider && (
              <div className="slider-area">
                <div className="slider-track">
                  <button
                    onClick={() => setSliderSettings(!sliderSettings)}
                    aria-label="Slider minimum"
                  >
                    {item.sliderMin ?? -10}
                  </button>
                  <input
                    aria-label={`Slider ${result.slider}`}
                    type="range"
                    min={item.sliderMin ?? -10}
                    max={item.sliderMax ?? 10}
                    step={item.sliderStep ?? 0.01}
                    value={result.value ?? 0}
                    onChange={(e) =>
                      onChange({
                        ...item,
                        latex: `${result.slider}=${e.target.value}`,
                      })
                    }
                  />
                  <button
                    onClick={() => setSliderSettings(!sliderSettings)}
                    aria-label="Slider maximum"
                  >
                    {item.sliderMax ?? 10}
                  </button>
                </div>
                {sliderSettings && (
                  <div className="slider-bounds">
                    {(["sliderMin", "sliderMax", "sliderStep"] as const).map(
                      (key, i) => (
                        <label key={key}>
                          {["min", "max", "step"][i]}
                          <input
                            type="number"
                            aria-label={`Slider ${["minimum", "maximum", "step"][i]}`}
                            value={item[key] ?? [-10, 10, 0.01][i]}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              const next = { ...item, [key]: n };
                              if (
                                Number.isFinite(n) &&
                                (next.sliderMin ?? -10) <
                                  (next.sliderMax ?? 10) &&
                                (next.sliderStep ?? 0.01) > 0
                              )
                                onChange(next);
                            }}
                          />
                        </label>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
            {result?.fit && (
              <div className="regression-result">
                <div className="regression-section">
                  <span>STATISTICS</span>
                  <MathText
                    latex={`R^2=${Number(result.fit.rSquared.toPrecision(7))}`}
                  />
                </div>
                <div className="regression-section">
                  <span>PARAMETERS</span>
                  {Object.entries(result.fit.parameters).map(
                    ([name, value]) => (
                      <MathText
                        key={name}
                        latex={`${name}=${Number(value.toPrecision(7))}`}
                      />
                    ),
                  )}
                </div>
                {result.fit.logModeAvailable && (
                  <label className="log-mode">
                    <input
                      type="checkbox"
                      checked={item.logMode ?? result.fit.logMode}
                      onChange={(e) =>
                        onChange({ ...item, logMode: e.target.checked })
                      }
                    />{" "}
                    Log Mode
                  </label>
                )}
              </div>
            )}
          </>
        ) : (
          <TableEditor
            item={item}
            onChange={onChange}
            onFocus={onSelect}
            register={register}
          />
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
      {styleOpen && (
        <div
          className="style-popover popover"
          role="dialog"
          aria-label="Expression style"
        >
          <div className="color-palette">
            {COLORS.map((color) => (
              <button
                key={color}
                aria-label={`Color ${color}`}
                className={item.color === color ? "selected" : ""}
                style={{ background: color }}
                onClick={() => onChange({ ...item, color })}
              />
            ))}
          </div>
          {item.type === "expression" && (
            <>
              <label>
                Line width{" "}
                <input
                  type="range"
                  min="1"
                  max="8"
                  step=".5"
                  value={item.lineWidth ?? 3}
                  onChange={(e) =>
                    onChange({ ...item, lineWidth: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Opacity{" "}
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step=".1"
                  value={item.opacity ?? 1}
                  onChange={(e) =>
                    onChange({ ...item, opacity: Number(e.target.value) })
                  }
                />
              </label>
              <div className="line-styles">
                {(["solid", "dashed", "dotted"] as const).map((style) => (
                  <button
                    key={style}
                    className={item.lineStyle === style ? "selected" : ""}
                    onClick={() => onChange({ ...item, lineStyle: style })}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="style-done" onClick={() => setStyleOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function TableEditor({
  item,
  onChange,
  onFocus,
  register,
}: {
  item: Table;
  onChange: (item: Table) => void;
  onFocus: () => void;
  register: (id: string, api: MathAPI | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const setCell = (row: number, col: number, value: string) => {
    const values = item.values.map((v) => [...v]);
    while (values.length <= row) values.push(["", ""]);
    values[row][col] = value;
    if (values[values.length - 1].some(Boolean)) values.push(["", ""]);
    onChange({ ...item, values: values.slice(0, 2000) });
  };
  return (
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
          .map((line) => line.split(/\t|,/).slice(0, 2));
        if (
          rows.length <= 2000 &&
          rows.every((r) => r.length === 2 && r.every((c) => c.length < 512))
        )
          onChange({ ...item, values: [...rows, ["", ""]] });
      }}
    >
      <div className="table-header">
        {item.headers.map((header, c) => (
          <div key={c} className="table-cell">
            {c === 1 && (
              <button
                className="table-color"
                style={{ background: item.color }}
                aria-label="Toggle table points"
                onClick={() => onChange({ ...item, hidden: !item.hidden })}
              >
                ⠿
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
            />
          </div>
        ))}
        <div className="table-ghost" />
      </div>
      {item.values.map((row, r) => (
        <div className="table-data-row" key={r}>
          {[0, 1].map((c) => (
            <div className="table-cell" key={c}>
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
                  inputs[(r + 1) * 2 + c]?.focus();
                }}
              />
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
  );
}
