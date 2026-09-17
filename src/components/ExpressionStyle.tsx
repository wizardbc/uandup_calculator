import { ThemeContext, visiblePlotColor, plotSymbolColor } from "../theme";
import { useContext, useEffect, useRef } from "react";
import {
  COLORS,
  type Expression,
  type PlotStyle,
  type RowResult,
} from "../types";
import { MathField } from "./MathField";

const PALETTE = [
  COLORS[0],
  COLORS[1],
  COLORS[2],
  COLORS[5],
  COLORS[3],
  COLORS[4],
];
export function ExpressionStyle({
  item,
  result,
  onChange,
  onClose,
  customColors = [],
  table = false,
  onAddRegression,
}: {
  item: Expression;
  result?: RowResult;
  onChange: (item: Expression) => void;
  onClose: () => void;
  customColors?: { name: string; colors: string[] }[];
  table?: boolean;
  onAddRegression?: () => void;
}) {
  const theme = useContext(ThemeContext);
  const root = useRef<HTMLDivElement>(null);
  const style = item.plotStyle ?? {};
  const dragMode = style.dragMode ?? result?.defaultDragMode ?? "none";
  const point =
    result?.geometry.some((g) => g.kind === "points") ||
    result?.kind === "point";
  const area = result?.geometry.some((g) => g.kind === "triangles");
  const polygon = result?.visualization?.kind === "polygon";
  function change(patch: Partial<PlotStyle>) {
    onChange({ ...item, plotStyle: { ...style, ...patch } });
  }
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  function toggle(
    label: string,
    checked: boolean,
    action: (v: boolean) => void,
  ) {
    return (
      <button
        type="button"
        className={`style-switch ${checked ? "enabled" : ""}`}
        role="checkbox"
        aria-label={
          {
            Points: "Points visible",
            Lines: "Lines visible",
            Fill: "Fill visible",
            Label: "Label visible",
            Drag: "Drag Enabled",
          }[label] ?? label
        }
        aria-checked={checked}
        onClick={() => action(!checked)}
      >
        <span />
      </button>
    );
  }
  function field(
    label: string,
    key:
      | "pointSize"
      | "pointOpacity"
      | "lineWidth"
      | "lineOpacity"
      | "fillOpacity"
      | "labelSize"
      | "labelAngle",
    fallback: string,
    icon: string,
  ) {
    return (
      <div className="plot-style-field">
        <span aria-hidden="true">{icon}</span>
        <MathField
          label={label}
          latex={style[key] ?? fallback}
          onChange={(v) => change({ [key]: v })}
        />
      </div>
    );
  }
  function lines() {
    return (
      <section className="plot-style-section">
        <div className="plot-style-heading">
          Lines
          {toggle("Lines", style.lines ?? !point, (v) => change({ lines: v }))}
        </div>
        {(style.lines ?? !point) && (
          <div className="plot-style-properties">
            <div>
              {field(
                "Line Opacity:",
                "lineOpacity",
                String(item.opacity ?? 1),
                "▧",
              )}
              {field(
                "Line Thickness (px)",
                "lineWidth",
                String(item.lineWidth ?? 2.5),
                "☰",
              )}
            </div>
            <div className="plot-line-choices">
              {(["solid", "dashed", "dotted"] as const).map((s) => (
                <button
                  key={s}
                  aria-label={`${s} line`}
                  aria-pressed={
                    (style.lineStyle ?? item.lineStyle ?? "solid") === s
                  }
                  onClick={() => change({ lineStyle: s })}
                >
                  <svg viewBox="0 0 28 28" aria-hidden="true">
                    <path
                      d="M5 23L23 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={
                        s === "dashed"
                          ? "5 5"
                          : s === "dotted"
                            ? "0 5"
                            : undefined
                      }
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }
  return (
    <div
      ref={root}
      className="style-popover plot-style-popover popover"
      role="dialog"
      aria-label="Expression style"
      onClick={(e) => e.stopPropagation()}
    >
      {point ? (
        <section className="plot-style-section">
          <div className="plot-style-heading">
            Points
            {toggle("Points", style.points ?? true, (v) =>
              change({ points: v }),
            )}
          </div>
          {(style.points ?? true) && (
            <>
              <div className="plot-style-properties">
                <div>
                  {field("Point Opacity:", "pointOpacity", "1", "▧")}
                  {field("Point Size:", "pointSize", "8", "☰")}
                </div>
                <div className="plot-point-choices">
                  {(
                    [
                      "point",
                      "open",
                      "cross",
                      "square",
                      "plus",
                      "triangle",
                      "diamond",
                      "star",
                    ] as const
                  ).map((s, i) => (
                    <button
                      key={s}
                      aria-label={`Point style ${s}`}
                      aria-pressed={(style.pointStyle ?? "point") === s}
                      onClick={() => change({ pointStyle: s })}
                    >
                      {["●", "○", "×", "■", "+", "▲", "◆", "★"][i]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="point-outline">
                <input
                  type="checkbox"
                  checked={style.pointOutline ?? false}
                  onChange={(e) => change({ pointOutline: e.target.checked })}
                />
                Point outline
              </label>
            </>
          )}
        </section>
      ) : (
        lines()
      )}
      {area && (
        <section className="plot-style-section">
          <div className="plot-style-heading">
            Fill{toggle("Fill", style.fill ?? true, (v) => change({ fill: v }))}
          </div>
          {(style.fill ?? true) &&
            field("Fill Opacity:", "fillOpacity", polygon ? "0.4" : "0.4", "▧")}
        </section>
      )}
      <div className="color-palette">
        {PALETTE.map((color) => (
          <button
            key={color}
            aria-label={`Color ${color}`}
            className={
              !item.colorLatex && item.color === color ? "selected" : ""
            }
            style={{ background: visiblePlotColor(color, theme) }}
            onClick={() => onChange({ ...item, color, colorLatex: undefined })}
          >
            {!item.colorLatex && item.color === color && (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m5 12 5 5 10-11"
                  fill="none"
                  stroke={plotSymbolColor(color, theme)}
                  strokeWidth="3"
                />
              </svg>
            )}
          </button>
        ))}
        {customColors.map(({ name, colors }) => (
          <button
            key={name}
            aria-label={`Color ${name}`}
            title={name}
            className={item.colorLatex === name ? "selected" : ""}
            style={{
              background:
                colors.length === 1
                  ? visiblePlotColor(colors[0], theme)
                  : `linear-gradient(90deg,${colors.map((c) => visiblePlotColor(c, theme)).join(",")})`,
            }}
            onClick={() => onChange({ ...item, colorLatex: name })}
          />
        ))}
      </div>
      {point && result?.kind === "list" && lines()}
      {point && (
        <>
          {!table && (
            <section className="plot-style-section">
              <div className="plot-style-heading">
                Label
                {toggle("Label", style.showLabel ?? false, (v) =>
                  change({ showLabel: v }),
                )}
              </div>
              {style.showLabel && (
                <div className="point-label-options">
                  <div className="label-adjustments">
                    <div>
                      {field("Label size", "labelSize", "1", "A")}
                      {field("Label angle", "labelAngle", "0", "∠")}
                    </div>
                    <div className="label-positions">
                      {(
                        [
                          "above_left",
                          "above",
                          "above_right",
                          "left",
                          "default",
                          "right",
                          "below_left",
                          "below",
                          "below_right",
                        ] as const
                      ).map((position, i) => (
                        <button
                          key={position}
                          aria-label={`Label position ${position.replace("_", " ")}`}
                          aria-pressed={
                            (style.labelOrientation ?? "default") === position
                          }
                          onClick={() => change({ labelOrientation: position })}
                        >
                          {["↖", "↑", "↗", "←", "•", "→", "↙", "↓", "↘"][i]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="point-outline">
                    <input
                      type="checkbox"
                      checked={style.labelOutline ?? true}
                      onChange={(e) =>
                        change({ labelOutline: e.target.checked })
                      }
                    />
                    Text outline
                  </label>
                </div>
              )}
            </section>
          )}
          <section className="plot-style-section">
            <div className="plot-style-heading">
              Drag
              {toggle("Drag", dragMode !== "none", (v) =>
                change({ dragMode: v ? "xy" : "none" }),
              )}
            </div>
            {dragMode !== "none" && (
              <div className="drag-choices">
                {(["x", "y", "xy"] as const).map((mode, i) => (
                  <button
                    key={mode}
                    aria-label={`Drag ${mode === "xy" ? "both directions" : mode + " only"}`}
                    aria-pressed={dragMode === mode}
                    onClick={() => change({ dragMode: mode })}
                  >
                    {["↔", "↕", "✥"][i]}
                  </button>
                ))}
              </div>
            )}
          </section>
          {!table && (style.showLabel || dragMode !== "none") && (
            <div className="point-screen-reader">
              <textarea
                aria-label="Add screen reader label"
                placeholder="Add screen reader label"
                value={style.screenReaderLabel ?? ""}
                onChange={(e) => change({ screenReaderLabel: e.target.value })}
              />
            </div>
          )}
        </>
      )}
      {table && onAddRegression && (
        <div className="table-style-actions">
          <button onClick={onAddRegression}>Add Regression</button>
        </div>
      )}
    </div>
  );
}
