import type { Expression, RowResult } from "../types";
import { MathField, MathText } from "./MathField";
import { numberLatex } from "./resultLatex";

export function RegressionResult({
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
  const fit = result.fit!;
  const residual = item.residualVariable ?? result.residualVariable ?? "e_{1}";
  return (
    <div className="custom-regression-result">
      <div className="regression-small-heading">REGRESSION PARAMETERS</div>
      <div className="custom-regression-parameters">
        {Object.entries(fit.parameters).map(([name, value]) => (
          <MathText
            key={name}
            latex={`${name.replace(/_([A-Za-z0-9]+)/g, "_{$1}")}=${numberLatex(value, 6)}`}
          />
        ))}
      </div>
      <div className="table-fit-bottom">
        <div>
          <div className="regression-small-heading">STATISTICS</div>
          <MathText
            latex={`R^2=${numberLatex(Number(fit.rSquared.toFixed(4)))}`}
          />
          {fit.correlation != null && (
            <MathText
              latex={`r=${numberLatex(Number(fit.correlation.toFixed(4)))}`}
            />
          )}
        </div>
        <div>
          <div className="regression-small-heading">RESIDUALS</div>
          <div className="residual-controls">
            <MathField
              label="Residual variable"
              latex={residual}
              onChange={(residualVariable) =>
                onChange({ ...item, residualVariable })
              }
            />
            <button
              aria-label="Plot residuals"
              onClick={() =>
                onExport(`(${result.regressionX ?? "x_1"},${residual})`)
              }
            >
              plot
            </button>
          </div>
        </div>
      </div>
      {fit.logModeAvailable && (
        <label className="log-mode">
          <input
            type="checkbox"
            checked={item.logMode ?? fit.logMode}
            onChange={(e) => onChange({ ...item, logMode: e.target.checked })}
          />{" "}
          Log Mode
        </label>
      )}
    </div>
  );
}
