import { useLayoutEffect, useRef, useState } from "react";
import type { RowResult } from "../types";
import { MathText } from "./MathField";
import { resultLatex } from "./resultLatex";

export function ListResult({ result }: { result: RowResult }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const values = result.listValues ?? [];
  const count = result.listLength ?? values.length;
  const literal = result.listLiteral && !expanded;
  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(".list-values");
    if (!el) return;
    const measure = () =>
      setOverflow(el.scrollWidth > el.clientWidth + 1 || count > 15);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [values, count, literal]);
  return (
    <div
      ref={root}
      className={`expression-result list-result ${expanded ? "expanded" : ""} ${literal ? "literal-list" : ""}`}
      aria-label={`Result ${result.display}`}
    >
      {!literal && (
        <div className="list-values">
          <span className="result-equals">
            <MathText latex="=" />
          </span>
          {(expanded ? values : values.slice(0, 15)).map((value, index) => (
            <span className="list-value" key={index}>
              <MathText latex={resultLatex(value)} />
            </span>
          ))}
        </div>
      )}
      {!expanded && (literal || overflow || count === 0) && (
        <button
          className="list-length"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
          disabled={count === 0}
        >
          {count === 0 ? "empty list" : `${count} element list`}
        </button>
      )}
    </div>
  );
}
