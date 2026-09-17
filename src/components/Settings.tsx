import { useRef, useState } from "react";
import type { GraphSettings, Viewport, EngineInput } from "../types";
import { formatCoordinate } from "../graph/render";
import { ConstantField } from "./ConstantField";
import { MathText } from "./MathField";
import { evaluateConstant } from "../engine/constants";
import { THEMES, isTheme, type Theme } from "../theme";

export function Settings({
  theme,
  followsSystem,
  onTheme,
  settings,
  viewport,
  onSettings,
  onViewport,
  scientific = false,
  expressions = [],
}: {
  theme: Theme;
  followsSystem: boolean;
  onTheme: (theme: Theme | null) => void;
  settings: GraphSettings;
  viewport: Viewport;
  onSettings: (settings: GraphSettings) => void;
  onViewport: (viewport: Viewport) => void;
  scientific?: boolean;
  expressions?: EngineInput["expressions"];
}) {
  const latestViewport = useRef(viewport);
  latestViewport.current = viewport;
  const [more, setMore] = useState(false);
  const [invalid, setInvalid] = useState("");
  const change = <K extends keyof GraphSettings>(
    key: K,
    value: GraphSettings[K],
  ) => onSettings({ ...settings, [key]: value });
  const check = (
    key:
      | "grid"
      | "minorGrid"
      | "axisNumbers"
      | "arrows"
      | "lockViewport"
      | "xAxis"
      | "yAxis",
    label: string,
  ) => (
    <label className="check">
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => change(key, e.target.checked)}
      />
      {label}
    </label>
  );
  async function bounds(key: "xMin" | "xMax" | "yMin" | "yMax", value: string) {
    try {
      const n = await evaluateConstant(value, expressions, settings.degrees);
      const next = {
        ...latestViewport.current,
        [key]: n,
        boundsLatex: { ...latestViewport.current.boundsLatex, [key]: value },
      };
      if (
        next.xMin >= next.xMax ||
        next.yMin >= next.yMax ||
        (settings.xLog && next.xMin <= 0) ||
        (settings.yLog && next.yMin <= 0)
      ) {
        setInvalid(
          "The minimum must be less than the maximum. Logarithmic bounds must be positive.",
        );
        return;
      }
      setInvalid("");
      latestViewport.current = next;
      onViewport(next);
    } catch {
      setInvalid("Enter a finite number for the axis bounds.");
    }
  }
  const gridIcon = (polar: boolean) => (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle
        cx="14"
        cy="14"
        r="13"
        fill={
          polar === settings.polar
            ? "var(--grid-selected, #666)"
            : "var(--grid-paper, white)"
        }
        stroke="var(--grid-lines, #888)"
      />
      <g
        stroke={
          polar === settings.polar
            ? "var(--grid-selected-lines, #eee)"
            : "var(--grid-lines, #999)"
        }
        strokeWidth=".7"
      >
        {polar ? (
          <>
            {[4, 8, 12].map((r) => (
              <circle key={r} cx="14" cy="14" r={r} fill="none" />
            ))}
            {[0, 30, 60, 90, 120, 150].map((a) => (
              <path key={a} d="M1 14H27" transform={`rotate(${a} 14 14)`} />
            ))}
          </>
        ) : (
          <>
            {[-10, -6, -2, 2, 6, 10].map((d) => {
              const span = Math.sqrt(169 - d * d);
              return (
                <path
                  key={d}
                  d={`M${14 + d} ${14 - span}V${14 + span}M${14 - span} ${14 + d}H${14 + span}`}
                />
              );
            })}
          </>
        )}
      </g>
    </svg>
  );
  return (
    <div
      className={`settings-panel popover ${scientific ? "scientific-settings" : ""}`}
      role="dialog"
      aria-label="Graph Settings"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="segmented text-size">
        <button
          className={!settings.largeText ? "selected" : ""}
          aria-label="Normal text size"
          aria-pressed={!settings.largeText}
          onClick={() => change("largeText", false)}
        >
          A
        </button>
        <button
          className={settings.largeText ? "selected" : ""}
          aria-label="Large text size"
          aria-pressed={settings.largeText}
          onClick={() => change("largeText", true)}
        >
          A
        </button>
      </div>
      {!scientific && (
        <>
          <div className="settings-rule" />
          <div className="grid-options">
            <div>
              {check("grid", "Grid")}
              <div className="grid-types">
                <button
                  className={!settings.polar ? "selected" : ""}
                  aria-label="Cartesian grid"
                  onClick={() => change("polar", false)}
                >
                  {gridIcon(false)}
                </button>
                <button
                  className={settings.polar ? "selected" : ""}
                  aria-label="Polar grid"
                  onClick={() => change("polar", true)}
                >
                  {gridIcon(true)}
                </button>
              </div>
              {check("arrows", "Arrows")}
            </div>
            <div className="small-options">
              {check("axisNumbers", "Axis Numbers")}
              {check("minorGrid", "Minor Gridlines")}
            </div>
          </div>
          {(["x", "y"] as const).map((axis) => (
            <div className="axis-settings" key={axis}>
              <div className="axis-heading">
                {check(
                  axis === "x" ? "xAxis" : "yAxis",
                  `${axis.toUpperCase()}-Axis`,
                )}
                <label className="axis-label-input">
                  <span>Label</span>
                  <input
                    aria-label={`${axis.toUpperCase()} axis label`}
                    placeholder={`e.g. “${axis}”`}
                    value={settings[axis === "x" ? "xLabel" : "yLabel"]}
                    onChange={(e) =>
                      change(axis === "x" ? "xLabel" : "yLabel", e.target.value)
                    }
                  />
                </label>
              </div>
              <div className="axis-bounds">
                <ConstantField
                  value={
                    viewport.boundsLatex?.[`${axis}Min`] ??
                    formatCoordinate(viewport[`${axis}Min`])
                  }
                  label={`${axis.toUpperCase()} axis minimum`}
                  onCommit={(value) => void bounds(`${axis}Min`, value)}
                />
                <MathText latex={`\\le ${axis}\\le`} />
                <ConstantField
                  value={
                    viewport.boundsLatex?.[`${axis}Max`] ??
                    formatCoordinate(viewport[`${axis}Max`])
                  }
                  label={`${axis.toUpperCase()} axis maximum`}
                  onCommit={(value) => void bounds(`${axis}Max`, value)}
                />
                {!settings[`${axis}Log`] && (
                  <label>
                    Step:{" "}
                    <ConstantField
                      value={settings[`${axis}Step`]}
                      label={`${axis.toUpperCase()} axis step`}
                      onCommit={(value) => {
                        if (!value.trim()) {
                          change(`${axis}Step`, "");
                          return;
                        }
                        void evaluateConstant(
                          value,
                          expressions,
                          settings.degrees,
                        )
                          .then((n) => {
                            if (n > 0) {
                              setInvalid("");
                              change(`${axis}Step`, value);
                            } else
                              setInvalid("The axis step must be positive.");
                          })
                          .catch(() =>
                            setInvalid("Enter a positive axis step."),
                          );
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          ))}
          {invalid && (
            <div className="inline-error" role="alert">
              {invalid}
            </div>
          )}
          <button className="more-options" onClick={() => setMore(!more)}>
            <span className={`disclosure-triangle ${more ? "expanded" : ""}`} />{" "}
            More Options
          </button>
          {more && (
            <div className="more-options-body">
              {(["x", "y"] as const).map((axis) => (
                <div className="axis-scale" key={axis}>
                  <span>{axis.toUpperCase()}-Axis:</span>
                  <div className="scale-choice">
                    <button
                      aria-label={`${axis.toUpperCase()} axis linear`}
                      className={!settings[`${axis}Log`] ? "selected" : ""}
                      onClick={() => change(`${axis}Log`, false)}
                    >
                      Linear
                    </button>
                    <button
                      aria-label={`${axis.toUpperCase()} axis logarithmic`}
                      className={settings[`${axis}Log`] ? "selected" : ""}
                      onClick={() => change(`${axis}Log`, true)}
                    >
                      Logarithmic
                    </button>
                  </div>
                </div>
              ))}
              {check("lockViewport", "Lock Viewport")}
            </div>
          )}
          <div className="settings-rule" />
        </>
      )}
      {scientific && <div className="settings-rule" />}
      <div className="complex-mode-row">
        <span>Complex Mode</span>
        <button
          role="checkbox"
          aria-label="Complex Mode"
          aria-checked={settings.complex}
          className={`mode-toggle ${settings.complex ? "checked" : ""}`}
          onClick={() => change("complex", !settings.complex)}
        >
          <span />
        </button>
      </div>
      {settings.complex && (
        <div className="complex-hint">
          Hint: try writing <i>i</i>
          <sup>2</sup> or √−4.
          {!scientific && (
            <>
              <br />
              Note: complex values will be plotted as (real, imag)
            </>
          )}
        </div>
      )}
      {!scientific && (
        <div className="segmented angle-mode">
          <button
            className={!settings.degrees ? "selected" : ""}
            onClick={() => change("degrees", false)}
          >
            Radians
          </button>
          <button
            className={settings.degrees ? "selected" : ""}
            onClick={() => change("degrees", true)}
          >
            Degrees
          </button>
        </div>
      )}
      <label className="theme-control">
        <span>Theme</span>
        <select
          aria-label="Color theme"
          value={theme}
          onChange={(event) => {
            if (isTheme(event.target.value)) onTheme(event.target.value);
          }}
        >
          {THEMES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="check system-theme-control">
        <input
          type="checkbox"
          checked={followsSystem}
          onChange={(e) => onTheme(e.target.checked ? null : theme)}
        />
        Use system setting
      </label>
    </div>
  );
}
