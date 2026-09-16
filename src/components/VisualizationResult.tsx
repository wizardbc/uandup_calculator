import type { Expression, RowResult } from "../types";
import { ConstantField } from "./ConstantField";
export function VisualizationResult({
  item,
  data,
  onChange,
}: {
  item: Expression;
  data: NonNullable<RowResult["visualization"]>;
  onChange: (item: Expression) => void;
}) {
  const options = item.visualization ?? {};
  const change = (patch: Partial<NonNullable<Expression["visualization"]>>) =>
    onChange({ ...item, visualization: { ...options, ...patch } });
  if (data.kind === "polygon") return null;
  if (data.kind === "boxplot")
    return (
      <div className="visualization-result">
        <h4>DISPLAY PROPERTIES</h4>
        <div className="box-properties">
          <label>
            Offset:{" "}
            <ConstantField
              value={options.boxOffset ?? "1"}
              label="Boxplot offset"
              onCommit={(boxOffset) => change({ boxOffset })}
            />
          </label>
          <label>
            Height:{" "}
            <ConstantField
              value={options.boxHeight ?? "1"}
              label="Boxplot height"
              onCommit={(boxHeight) => change({ boxHeight })}
            />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={options.showOutliers ?? true}
            onChange={(e) => change({ showOutliers: e.target.checked })}
          />
          Show Outliers as Dots
        </label>
      </div>
    );
  return (
    <div className="visualization-result">
      <div className="parameter-hint">
        data set, bin width{data.width === 1 ? " = 1" : ""}
      </div>
      {data.kind === "histogram" && (
        <div className="histogram-properties">
          <div>
            <h4>BAR HEIGHTS</h4>
            <div className="visualization-choice">
              {(["count", "relative", "density"] as const).map((value) => (
                <button
                  key={value}
                  className={
                    (options.histogramMode ?? "count") === value
                      ? "selected"
                      : ""
                  }
                  onClick={() => change({ histogramMode: value })}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4>BIN ALIGNMENT</h4>
            <div className="visualization-choice">
              {(["center", "left"] as const).map((value) => (
                <button
                  key={value}
                  className={
                    (options.binAlignment ?? "center") === value
                      ? "selected"
                      : ""
                  }
                  onClick={() => change({ binAlignment: value })}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
