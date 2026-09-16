import {numberLatex} from "./resultLatex";
import { useState } from "react";
import type { Expression, RowResult } from "../types";
import { MathField, MathText } from "./MathField";
export function DistributionResult({
  item,
  data,
  onChange,
  onExport,
}: {
  item: Expression;
  data: NonNullable<RowResult["distribution"]>;
  onChange: (item: Expression) => void;
  onExport: (latex: string) => void;
}) {
  const options = item.distribution ?? {};
  const [exporting, setExporting] = useState(false);
  const change = (patch: Partial<NonNullable<Expression["distribution"]>>) =>
    onChange({ ...item, distribution: { ...options, ...patch } });
  const region = options.region ?? "inner",
    compute = options.compute ?? "area";
  const format = (n: number | null) =>
    n === null ? "\\operatorname{undefined}" : numberLatex(n,7);
  const labels: Record<string, string> = {
    normaldist: "mean, stdev",
    tdist: "degrees of freedom",
    chisqdist: "degrees of freedom",
    uniformdist: "minimum, maximum",
    binomialdist: "trials, success probability",
    poissondist: "mean",
    geodist: "success probability",
    discretedist: "values, weights",
  };
  const bound = (side: "lower" | "upper") =>
    compute === "area" ? (
      <MathField
        label={side === "lower" ? "Lower Bound" : "Upper Bound"}
        latex={options[side] ?? format(data[side])}
        onChange={(value) => change({ [side]: value })}
      />
    ) : (
      <MathText latex={format(data[side])} />
    );
  return (
    <div className="distribution-result">
      <div className="parameter-hint">{labels[data.kind]}</div>
      <button
        className="result-disclosure"
        aria-expanded={options.show ?? false}
        onClick={() => change({ show: !options.show })}
      >
        <span
          className={`disclosure-triangle ${options.show ? "expanded" : ""}`}
        />
        Cumulative Probability
      </button>
      {options.show && (
        <div className="distribution-cdf">
          <div className="distribution-toolbar">
            <div>
              <h4>REGION</h4>
              <div className="visualization-choice">
                {(["inner", "outer", "left", "right"] as const).map((value) => (
                  <button
                    key={value}
                    className={region === value ? "selected" : ""}
                    onClick={() => change({ region: value })}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4>COMPUTE</h4>
              <div className="visualization-choice">
                {(["area", "bounds"] as const).map((value) => (
                  <button
                    key={value}
                    className={compute === value ? "selected" : ""}
                    onClick={() => change({ compute: value })}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="probability-expression">
            <MathText latex="P(" />
            {region === "left" ? (
              <>
                <MathText latex={"x\\le"} />
                {bound("upper")}
              </>
            ) : region === "right" ? (
              <>
                {bound("lower")}
                <MathText latex={"\\le x"} />
              </>
            ) : region === "outer" ? (
              <>
                <MathText latex={"x\\le"} />
                {bound("lower")}
                <span>or</span>
                {bound("upper")}
                <MathText latex={"\\le x"} />
              </>
            ) : (
              <>
                {bound("lower")}
                <MathText latex={"\\le x\\le"} />
                {bound("upper")}
              </>
            )}
            <MathText latex=")=" />
            {compute === "bounds" ? (
              <MathField
                latex={options.area ?? "0.68"}
                label="Cumulative Probability"
                onChange={(area) => change({ area })}
              />
            ) : (
              <span className="probability-value">
                <button
                  aria-label={`Probability ${Number(data.area.toFixed(3))}`}
                  onClick={() => setExporting(!exporting)}
                >
                  <MathText latex={String(Number(data.area.toFixed(3)))} />
                  <span>▾</span>
                </button>
                {exporting && (
                  <button
                    className="popover export-probability"
                    onClick={() => {
                      onExport(numberLatex(data.area));
                      setExporting(false);
                    }}
                  >
                    Export probability
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      )}
      <button
        className="result-disclosure"
        aria-expanded={options.summary ?? false}
        onClick={() => change({ summary: !options.summary })}
      >
        <span
          className={`disclosure-triangle ${options.summary ? "expanded" : ""}`}
        />
        Summary
      </button>
      {options.summary && (
        <div className="distribution-summary">
          <table className="statistics-table">
            <tbody>
              {(
                [
                  ["Mean", data.mean],
                  ["Median", data.median],
                  ["Standard Deviation", data.stdev],
                  ["Variance", data.variance],
                ] as const
              ).map(([label, value]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>
                    <MathText latex={format(value)} />
                    <button
                      aria-label={`Export ${label}`}
                      onClick={() =>
                        onExport(value === null ? "0/0" : numberLatex(value))
                      }
                    >
                      ▣
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
