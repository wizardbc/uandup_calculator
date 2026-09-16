import {numberLatex} from "./resultLatex";
import { useState } from "react";
import type { RowResult } from "../types";
import { MathText } from "./MathField";
export function StatisticsResult({
  data,
  onExport,
}: {
  data: NonNullable<RowResult["statistics"]>;
  onExport: (latex: string) => void;
}) {
  const [five, setFive] = useState(false);
  const rows: [string, number | null][] = [
    ["Count", data.count],
    ["Mean", data.mean],
    ["Median", data.median],
    ["Standard Deviation", data.stdev],
    ["Population Standard Dev", data.stdevp],
  ];
  function table(values: [string, number | null][]) {
    return (
      <table className="statistics-table">
        <tbody>
          {values.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>
                <MathText
                  latex={
                    value === null
                      ? "\\operatorname{undefined}"
                      : numberLatex(value,7)
                  }
                />
                <button
                  aria-label={`Export ${label}`}
                  onClick={() =>
                    onExport(value === null ? "0/0" : numberLatex(value))
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="15"
                    height="15"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 3H10V6H5V12H11V8H14V15H2Z"
                      fill="currentColor"
                    />
                    <path
                      d="M7 9L13 3M10 3H13V6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div className="statistics-result">
      {table(rows)}
      <button
        className="result-disclosure"
        onClick={() => setFive(!five)}
        aria-expanded={five}
      >
        <span className={`disclosure-triangle ${five ? "expanded" : ""}`} />
        Five Number Summary
      </button>
      {five &&
        table(
          [
            "Minimum",
            "First Quartile",
            "Median",
            "Third Quartile",
            "Maximum",
          ].map((label, i) => [label, data.fiveNumber[i]]),
        )}
    </div>
  );
}
