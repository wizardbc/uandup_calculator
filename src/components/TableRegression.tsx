import { useState } from "react";
import type { RowResult, Table } from "../types";
import {
  regressionModels,
  regressionLatex,
  fitEquation,
  regressionValues,
} from "../engine/regressionModels";
import { MathField, MathText } from "./MathField";
import { Icon } from "./Icons";
export function TableRegression({
  item,
  result,
  onChange,
  onExport,
}: {
  item: Table;
  result?: RowResult;
  onChange: (item: Table) => void;
  onExport: (latex: string) => void;
}) {
  const [options, setOptions] = useState(false),
    [models, setModels] = useState(false);
  const fit = item.regression!;
  const model = regressionModels[fit.model];
  const parameters = result?.fit
    ? regressionValues(item, result.fit.parameters)
    : {};
  const fitReady = model.parameters.every((name) =>
    Number.isFinite(parameters[name]),
  );
  const change = (patch: Partial<NonNullable<Table["regression"]>>) =>
    onChange({ ...item, regression: { ...fit, ...patch } });
  return (
    <div className="table-regression">
      <button
        className="regression-graph-icon"
        aria-label={`${fit.hidden ? "Show" : "Hide"} Regression`}
        style={{ background: fit.color, opacity: fit.hidden ? 0.4 : 1 }}
        onClick={() => change({ hidden: !fit.hidden })}
      >
        <Icon name="curve" size={24} />
      </button>
      <div className="table-regression-heading">
        <button
          className="regression-model-select"
          onClick={() => {
            setModels((v) => !v);
            setOptions(false);
          }}
          aria-expanded={models}
        >
          {model.label} Regression <Icon name="down" size={12} />
        </button>
        <button
          aria-label="Regression options"
          onClick={() => setOptions((v) => !v)}
        >
          ⋮
        </button>
      </div>
      {models && (
        <div className="regression-model-menu popover">
          {Object.entries(regressionModels).map(([key, m]) => (
            <button
              key={key}
              onClick={() => {
                change({ model: key as keyof typeof regressionModels });
                setModels(false);
              }}
            >
              {m.label} Regression
            </button>
          ))}
        </div>
      )}
      {options && (
        <div className="regression-model-structure">
          <div className="regression-small-heading">
            REGRESSION MODEL STRUCTURE
          </div>
          <MathText latex={`y\\sim ${model.latex}`} />
          <button onClick={() => onExport(regressionLatex(item))}>
            Export as custom regression
          </button>
          <button onClick={() => onChange({ ...item, regression: undefined })}>
            Delete regression
          </button>
        </div>
      )}
      {result?.error ? (
        <div className="expression-error">{result.error}</div>
      ) : (
        result?.fit &&
        fitReady && (
          <>
            <div className="regression-equation">
              <div className="regression-small-heading">EQUATION</div>
              <MathText
                latex={fitEquation(
                  fit,
                  regressionValues(item, result.fit.parameters),
                )}
              />
              <button
                aria-label="Export regression equation"
                onClick={() =>
                  onExport(
                    fitEquation(
                      fit,
                      regressionValues(item, result.fit!.parameters),
                    ),
                  )
                }
              >
                ▣
              </button>
            </div>
            <div className="table-fit-bottom">
              <div>
                <div className="regression-small-heading">STATISTICS</div>
                <MathText
                  latex={`R^2=${Number(result.fit.rSquared.toFixed(4))}`}
                />
                {fit.model === "linear" && (
                  <MathText
                    latex={`r=${Number((Math.sign(regressionValues(item, result.fit.parameters).m) * Math.sqrt(Math.max(0, result.fit.rSquared))).toFixed(4))}`}
                  />
                )}
              </div>
              <div>
                <div className="regression-small-heading">RESIDUALS</div>
                <div className="residual-controls">
                  <MathField
                    label="Residual variable"
                    latex={fit.residualVariable}
                    onChange={(residualVariable) =>
                      change({ residualVariable })
                    }
                  />
                  <button
                    onClick={() =>
                      onExport(
                        `(${item.headers[fit.xColumn]},${fit.residualVariable})`,
                      )
                    }
                  >
                    plot
                  </button>
                </div>
              </div>
            </div>
            {result.fit.logModeAvailable && (
              <label className="log-mode">
                <input
                  type="checkbox"
                  checked={fit.logMode ?? result.fit.logMode}
                  onChange={(e) => change({ logMode: e.target.checked })}
                />
                Log Mode
              </label>
            )}
          </>
        )
      )}
    </div>
  );
}
