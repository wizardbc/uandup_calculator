import { useState } from "react";
import type { Expression, RowResult } from "../types";
import { MathField, MathText } from "./MathField";
const num = (n: number) => Number(n.toFixed(3)).toString();
export function InferenceResult({
  item,
  result,
  onChange,
  onExport,
}: {
  item: Expression;
  result: RowResult;
  onChange: (item: Expression) => void;
  onExport: (latex: string) => void;
}) {
  const t = result.inference!;
  const [confidence, setConfidence] = useState(false),
    [hypothesis, setHypothesis] = useState(false),
    [observed, setObserved] = useState(false);
  const [more, setMore] = useState<"confidence" | "test" | null>(null);
  const [expected, setExpected] = useState(true),
    [contributions, setContributions] = useState(false),
    [totals, setTotals] = useState(false);
  const chi = t.kind.startsWith("chisq"),
    tails = item.inferenceTails ?? "both";
  const base =
    /^([a-zA-Z](?:_\{?\w+\}?)?)\s*=/.exec(item.latex)?.[1] ?? `(${item.latex})`;
  const testBase = item.inferenceNull
    ? `${base}.\\operatorname{null}(${item.inferenceNull})`
    : base;
  const probability =
    tails === "left" ? t.pleft : tails === "right" ? t.pright : t.p;
  const scoreSymbol = chi ? "\\chi^{2}" : t.kind === "ttest" ? "t" : "z";
  const curve = result.inferenceChart ?? [];
  const xmin = curve[0]?.[0] ?? -4,
    xmax = curve.at(-1)?.[0] ?? 4,
    max = Math.max(...curve.map((p) => p[1]), 1e-9);
  const sx = (x: number) => (259 * (x - xmin)) / (xmax - xmin),
    sy = (y: number) => 90 - (64 * y) / max;
  const path = curve
    .map((p, i) => `${i ? "L" : "M"}${sx(p[0])},${sy(p[1])}`)
    .join(" ");
  const shade = (x: number) =>
    chi
      ? x >= t.score
      : tails === "left"
        ? x <= t.score
        : tails === "right"
          ? x >= t.score
          : Math.abs(x) >= Math.abs(t.score);
  const shading = curve
    .slice(1)
    .map((p, i) =>
      shade((curve[i][0] + p[0]) / 2)
        ? `M${sx(curve[i][0])},90 L${sx(curve[i][0])},${sy(curve[i][1])} L${sx(p[0])},${sy(p[1])} L${sx(p[0])},90 Z`
        : "",
    )
    .join(" ");
  const exportMenu = (type: "confidence" | "test") => (
    <div className="inference-export-menu">
      {(type === "confidence"
        ? [
            [
              "Lower Bound",
              `.\\operatorname{conf}(${item.inferenceLevel ?? "0.95"}).\\operatorname{lower}`,
            ],
            [
              "Upper Bound",
              `.\\operatorname{conf}(${item.inferenceLevel ?? "0.95"}).\\operatorname{upper}`,
            ],
            ["Point Estimate", ".\\operatorname{estimate}"],
            ["Standard Error", ".\\operatorname{stderr}"],
            ...(t.dof !== null
              ? [["Degrees of Freedom", ".\\operatorname{dof}"]]
              : []),
          ]
        : [
            ["Test Statistic", ".\\operatorname{score}"],
            [
              "p-value",
              `.\\operatorname{${tails === "both" || chi ? "p" : tails === "left" ? "pleft" : "pright"}}`,
            ],
            ...(t.dof !== null
              ? [["Degrees of Freedom", ".\\operatorname{dof}"]]
              : []),
          ]
      ).map(([label, member]) => (
        <button
          key={label}
          onClick={() => {
            onExport(`${type === "test" ? testBase : base}${member}`);
            setMore(null);
          }}
        >
          {label}
          <span>↗</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="inference-result" onClick={(e) => e.stopPropagation()}>
      {chi ? (
        <>
          <button
            className="result-section-heading"
            aria-expanded={observed}
            onClick={() => setObserved(!observed)}
          >
            <span>{observed ? "▼" : "▶"}</span>Observed (Expected)
          </button>
          {observed && (
            <div className="result-section-body">
              <div className="observed-options">
                {[
                  ["Expected", expected, setExpected],
                  ["Contributions", contributions, setContributions],
                  ["Totals", totals, setTotals],
                ].map(([label, value, set]) => (
                  <label key={String(label)}>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) =>
                        (set as (v: boolean) => void)(e.target.checked)
                      }
                    />
                    {String(label)}
                  </label>
                ))}
              </div>
              <table className="observed-table">
                <thead>
                  <tr>
                    {t.observed.map((_, c) => (
                      <th key={c}>
                        {t.observed.length === 1 ? "Count" : `Group ${c + 1}`}
                      </th>
                    ))}
                    {contributions && t.observed.length === 1 && (
                      <th>Contribution</th>
                    )}
                    {totals && t.observed.length > 1 && <th>Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {t.observed[0]?.map((_, r) => (
                    <tr key={r}>
                      {t.observed.map((col, c) => {
                        const e = t.expected[c][r],
                          contribution = (col[r] - e) ** 2 / e;
                        return (
                          <td
                            key={c}
                            style={
                              contributions && t.observed.length > 1
                                ? {
                                    background: `rgba(45,112,228,${Math.min(0.7, contribution / Math.max(t.score, 1))})`,
                                  }
                                : undefined
                            }
                          >
                            {num(col[r])}
                            {expected && <span> ({num(e)})</span>}
                          </td>
                        );
                      })}
                      {contributions && t.observed.length === 1 && (
                        <td>
                          {num(
                            (t.observed[0][r] - t.expected[0][r]) ** 2 /
                              t.expected[0][r],
                          )}
                        </td>
                      )}
                      {totals && t.observed.length > 1 && (
                        <td>{num(t.observed.reduce((s, c) => s + c[r], 0))}</td>
                      )}
                    </tr>
                  ))}
                  {totals && (
                    <tr>
                      {t.observed.map((c, i) => (
                        <td key={i}>{num(c.reduce((a, b) => a + b, 0))}</td>
                      ))}
                      {contributions && t.observed.length === 1 && (
                        <td>{num(t.score)}</td>
                      )}
                      {t.observed.length > 1 && (
                        <td>
                          {num(t.observed.flat().reduce((a, b) => a + b, 0))}
                        </td>
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            className="result-section-heading"
            aria-expanded={confidence}
            onClick={() => setConfidence(!confidence)}
          >
            <span>{confidence ? "▼" : "▶"}</span>Confidence Interval
          </button>
          {confidence && (
            <div className="result-section-body">
              <label className="inference-field-label">
                Confidence level:{" "}
                <MathField
                  latex={item.inferenceLevel ?? "0.95"}
                  label="Confidence level"
                  onChange={(v) => onChange({ ...item, inferenceLevel: v })}
                />
              </label>
              <div className="confidence-diagram">
                <svg
                  viewBox="0 0 259 49"
                  aria-label={`Confidence interval ${num(t.lower)} to ${num(t.upper)}`}
                >
                  <path
                    d="M65 17H194 M65 14V20 M194 14V20"
                    stroke="#555"
                    fill="none"
                  />
                  <circle cx="130" cy="17" r="2.5" />
                  <text x="65" y="39" textAnchor="middle">
                    {num(t.lower)}
                  </text>
                  <text x="194" y="39" textAnchor="middle">
                    {num(t.upper)}
                  </text>
                </svg>
                <button
                  className="diagram-more"
                  aria-label="Confidence interval more options"
                  onClick={() =>
                    setMore(more === "confidence" ? null : "confidence")
                  }
                >
                  ⋮
                </button>
                {more === "confidence" && exportMenu("confidence")}
              </div>
            </div>
          )}
        </>
      )}
      <button
        className="result-section-heading"
        aria-expanded={hypothesis}
        onClick={() => setHypothesis(!hypothesis)}
      >
        <span>{hypothesis ? "▼" : "▶"}</span>Hypothesis Test
      </button>
      {hypothesis && (
        <div className="result-section-body">
          {!chi && (
            <>
              <label className="inference-field-label">
                Null hypothesis:{" "}
                <MathText latex={`${t.kind === "zproptest" ? "p" : "\\mu"}=`} />
                <MathField
                  latex={item.inferenceNull ?? String(t.null)}
                  label="Null hypothesis"
                  onChange={(v) => onChange({ ...item, inferenceNull: v })}
                />
              </label>
              <div className="tails-select">
                <span>Tails:</span>
                <div>
                  {(["left", "both", "right"] as const).map((side) => (
                    <button
                      key={side}
                      className={tails === side ? "selected" : ""}
                      onClick={() =>
                        onChange({ ...item, inferenceTails: side })
                      }
                    >
                      {side[0].toUpperCase() + side.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="hypothesis-diagram">
            <svg
              viewBox="0 0 259 119"
              aria-label={`Test statistic ${num(t.score)}, p-value ${probability}`}
            >
              <path d={shading} fill="#2d70e4" fillOpacity=".3" />
              <path d={path} fill="none" stroke="#2d70e4" strokeWidth="1.5" />
              <path d="M0 90H259" stroke="#777" />
              <circle cx={sx(t.score)} cy="90" r="2.5" />
              {!chi &&
                Array.from({ length: 11 }, (_, i) => (
                  <path key={i} d={`M${21.5 + i * 21.6} 87V93`} stroke="#777" />
                ))}
            </svg>
            <div className="test-statistics">
              <span>
                <i>p</i>-value{" "}
              </span>
              <MathText
                latex={
                  probability < 0.0001 ? "<0.0001" : `=${num(probability)}`
                }
              />
              {t.dof !== null && (
                <div>
                  <MathText latex={`\\mathrm{df}=${num(t.dof)}`} />
                </div>
              )}
            </div>
            <span
              className="test-score"
              style={{ left: Math.max(5, Math.min(180, sx(t.score) - 12)) }}
            >
              <MathText latex={`${scoreSymbol}=${num(t.score)}`} />
            </span>
            <button
              className="diagram-more"
              aria-label="Hypothesis test more options"
              onClick={() => setMore(more === "test" ? null : "test")}
            >
              ⋮
            </button>
            {more === "test" && exportMenu("test")}
          </div>
        </div>
      )}
    </div>
  );
}
