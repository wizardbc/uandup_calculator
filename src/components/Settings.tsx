import { useState } from "react";
import type { GraphSettings, Viewport } from "../types";
import { formatCoordinate } from "../graph/render";

export function Settings({
  settings,
  viewport,
  onSettings,
  onViewport,
  scientific = false,
}: {
  settings: GraphSettings;
  viewport: Viewport;
  onSettings: (settings: GraphSettings) => void;
  onViewport: (viewport: Viewport) => void;
  scientific?: boolean;
}) {
  const [more, setMore] = useState(false);
  const [invalid, setInvalid] = useState("");
  const change = <K extends keyof GraphSettings>(
    key: K,
    value: GraphSettings[K],
  ) => onSettings({ ...settings, [key]: value });
  const check = (
    key:
      | "reverseContrast"
      | "grid"
      | "minorGrid"
      | "axisNumbers"
      | "arrows"
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
  function bounds(key: "xMin" | "xMax" | "yMin" | "yMax", value: string) {
    const n = Number(value.replace("−", "-"));
    const next = { ...viewport, [key]: n };
    if (
      !value.trim() ||
      !Number.isFinite(n) ||
      next.xMin >= next.xMax ||
      next.yMin >= next.yMax
    ) {
      setInvalid("The minimum must be less than the maximum.");
      return;
    }
    setInvalid("");
    onViewport(next);
  }
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
          onClick={() => change("largeText", false)}
        >
          A
        </button>
        <button
          className={settings.largeText ? "selected" : ""}
          aria-label="Large text size"
          onClick={() => change("largeText", true)}
        >
          A
        </button>
      </div>
      {check("reverseContrast", "Reverse contrast")}
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
                  ▦
                </button>
                <button
                  className={settings.polar ? "selected" : ""}
                  aria-label="Polar grid"
                  onClick={() => change("polar", true)}
                >
                  ◎
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
                <input
                  key={`${axis}min-${viewport[`${axis}Min`]}`}
                  aria-label={`${axis.toUpperCase()} axis minimum`}
                  defaultValue={formatCoordinate(viewport[`${axis}Min`])}
                  style={{
                    width: `${Math.max(4, formatCoordinate(viewport[`${axis}Min`]).length) * 0.53 + 0.3}em`,
                  }}
                  onBlur={(e) => bounds(`${axis}Min`, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <span>
                  ≤ <i>{axis}</i> ≤
                </span>
                <input
                  key={`${axis}max-${viewport[`${axis}Max`]}`}
                  aria-label={`${axis.toUpperCase()} axis maximum`}
                  defaultValue={formatCoordinate(viewport[`${axis}Max`])}
                  style={{
                    width: `${Math.max(4, formatCoordinate(viewport[`${axis}Max`]).length) * 0.53 + 0.3}em`,
                  }}
                  onBlur={(e) => bounds(`${axis}Max`, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <label>
                  Step:{" "}
                  <input
                    aria-label={`${axis.toUpperCase()} axis step`}
                    value={settings[axis === "x" ? "xStep" : "yStep"]}
                    onChange={(e) =>
                      change(axis === "x" ? "xStep" : "yStep", e.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          {invalid && (
            <div className="inline-error" role="alert">
              {invalid}
            </div>
          )}
          <button className="more-options" onClick={() => setMore(!more)}>
            {more ? "▾" : "▸"} More Options
          </button>
          {more && (
            <div className="more-options-body">
              <button
                onClick={() => {
                  const cx = (viewport.xMin + viewport.xMax) / 2;
                  const half =
                    (((viewport.yMax - viewport.yMin) / viewport.height) *
                      viewport.width) /
                    2;
                  onViewport({ ...viewport, xMin: cx - half, xMax: cx + half });
                }}
              >
                Square axes
              </button>
              <button
                onClick={() =>
                  onViewport({
                    ...viewport,
                    xMin: -10,
                    xMax: 10,
                    yMin: (-10 * viewport.height) / viewport.width,
                    yMax: (10 * viewport.height) / viewport.width,
                  })
                }
              >
                Restore default view
              </button>
            </div>
          )}
          <div className="settings-rule" />
        </>
      )}
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
    </div>
  );
}
