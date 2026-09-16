import { useRef, useState } from "react";
import { MathField, type MathAPI } from "./MathField";
import { Icon } from "./Icons";

type TestName =
  "ztest" | "ttest" | "zproptest" | "chisqtest" | "chisqgof" | "distribution";
const TITLES: Record<TestName, React.ReactNode> = {
  ztest: (
    <>
      <i>z</i>-test
    </>
  ),
  ttest: (
    <>
      <i>t</i>-test
    </>
  ),
  zproptest: (
    <>
      <i>z</i>-test for proportions
    </>
  ),
  chisqtest: (
    <>
      <i>χ</i>
      <sup>2</sup> test for independence
    </>
  ),
  chisqgof: (
    <>
      <i>χ</i>
      <sup>2</sup> goodness of fit test
    </>
  ),
  distribution: "Probability Distribution",
};
const DISTRIBUTIONS = [
  {
    name: "normaldist",
    title: "Normal distribution",
    labels: ["mean", "stdev"],
    defaults: ["0", "1"],
  },
  {
    name: "tdist",
    title: "Student's t-distribution",
    labels: ["degrees of freedom"],
    defaults: ["1"],
  },
  {
    name: "chisqdist",
    title: "Chi-square distribution",
    labels: ["degrees of freedom"],
    defaults: ["1"],
  },
  {
    name: "uniformdist",
    title: "Uniform distribution",
    labels: ["minimum", "maximum"],
    defaults: ["0", "1"],
  },
  {
    name: "binomialdist",
    title: "Binomial distribution",
    labels: ["trials", "probability"],
    defaults: ["1", "0.5"],
  },
  {
    name: "poissondist",
    title: "Poisson distribution",
    labels: ["mean"],
    defaults: ["1"],
  },
  {
    name: "geodist",
    title: "Geometric distribution",
    labels: ["probability"],
    defaults: ["0.5"],
  },
];
export function InferenceWizard({
  onClose,
  onCreate,
  onFocus,
}: {
  onClose: () => void;
  onCreate: (latex: string) => void;
  onFocus: (api: MathAPI) => void;
}) {
  const [test, setTest] = useState<TestName | null>(null);
  const [stats, setStats] = useState(false);
  const [second, setSecond] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [table, setTable] = useState<string[][]>([
    ["", ""],
    ["", ""],
  ]);
  const [distribution, setDistribution] = useState(0);
  const fields = useRef(new Map<string, MathAPI>());
  const dist = DISTRIBUTIONS[distribution];
  const choose = (name: TestName) => {
    setTest(name);
    setValues({});
    setTable([
      ["", ""],
      ["", ""],
    ]);
    setSecond(false);
  };
  function field(id: string, label: string, defaultValue = "") {
    return (
      <MathField
        key={id}
        latex={values[id] ?? defaultValue}
        label={label}
        onChange={(v) => setValues((old) => ({ ...old, [id]: v }))}
        onFocus={() => {
          const api = fields.current.get(id);
          if (api) onFocus(api);
        }}
        onEnter={() => {}}
        register={(api) => {
          if (api) fields.current.set(id, api);
          else fields.current.delete(id);
        }}
      />
    );
  }
  const labels =
    test === "zproptest"
      ? ["successes", "sample size"]
      : stats
        ? ["sample size", "mean", test === "ztest" ? "pop stdev" : "stdev"]
        : test === "ztest"
          ? ["list of data", "pop stdev"]
          : ["list of data"];
  const list = (s: string) =>
    s.includes(",") && !s.trim().startsWith("[") ? `[${s}]` : s;
  function create() {
    if (!test) return;
    if (test === "distribution") {
      onCreate(
        `\\operatorname{${dist.name}}(${dist.labels.map((_, i) => values[`d${i}`] ?? dist.defaults[i]).join(",")})`,
      );
      return;
    }
    let args: string[] = [];
    if (test === "chisqtest" || test === "chisqgof") {
      const complete = table.filter((row) => row[0]?.trim());
      const cols =
        test === "chisqgof" && !complete.some((r) => r[1]?.trim())
          ? 1
          : Math.max(...complete.map((r) => r.filter(Boolean).length));
      for (let c = 0; c < cols; c++)
        args.push(`[${complete.map((r) => r[c] || "0").join(",")}]`);
    } else
      for (let n = 0; n < (second ? 2 : 1); n++) {
        const entries = labels.map((_, c) => values[`${n}:${c}`] ?? "");
        if (stats && test !== "zproptest") args.push(...entries);
        else args.push(...entries.map(list));
      }
    onCreate(`\\operatorname{${test}}(${args.join(",")})`);
  }
  const complete =
    test === "distribution" || test?.startsWith("chisq")
      ? test === "distribution" || table.filter((r) => r[0]?.trim()).length >= 2
      : Array.from({ length: second ? 2 : 1 }, (_, n) =>
          labels.every((_, c) => values[`${n}:${c}`]?.trim()),
        ).every(Boolean);
  return (
    <div className="inference-overlay" onPointerDown={onClose}>
      <section
        className={`inference-wizard ${test ? "has-test" : ""}`}
        role="dialog"
        aria-label="Inference"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="inference-close"
          aria-label="Close Dialog"
          onClick={onClose}
        >
          <Icon name="close" size={24} />
        </button>
        {test ? (
          <>
            <header className="inference-title">
              <button aria-label="Back" onClick={() => setTest(null)}>
                ‹
              </button>
              <span>{TITLES[test]}</span>
              {(test === "ztest" || test === "ttest") && (
                <div className="inference-tabs">
                  <button
                    className={!stats ? "selected" : ""}
                    onClick={() => {
                      setStats(false);
                      setValues({});
                    }}
                  >
                    Data
                  </button>
                  <button
                    className={stats ? "selected" : ""}
                    onClick={() => {
                      setStats(true);
                      setValues({});
                    }}
                  >
                    Stats
                  </button>
                </div>
              )}
            </header>
            <div className="inference-form">
              {test === "distribution" ? (
                <>
                  <select
                    aria-label="Probability distribution"
                    value={distribution}
                    onChange={(e) => {
                      setDistribution(Number(e.target.value));
                      setValues({});
                    }}
                  >
                    {DISTRIBUTIONS.map((d, i) => (
                      <option key={d.name} value={i}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                  <table className="wizard-table">
                    <thead>
                      <tr>
                        {dist.labels.map((l) => (
                          <th key={l}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {dist.labels.map((l, i) => (
                          <td key={l}>{field(`d${i}`, l, dist.defaults[i])}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </>
              ) : test.startsWith("chisq") ? (
                <div className="wizard-counts">
                  <table className="wizard-table">
                    <thead>
                      <tr>
                        {test === "chisqtest" && <th />}
                        {Array.from({ length: table[0].length }, (_, c) => (
                          <th key={c}>
                            {test === "chisqgof"
                              ? c === 0
                                ? "Observed"
                                : "Expected (optional)"
                              : `Group ${c + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((row, r) => (
                        <tr key={r}>
                          {test === "chisqtest" && (
                            <th>Group {String.fromCharCode(65 + r)}</th>
                          )}
                          {row.map((v, c) => (
                            <td key={c}>
                              <MathField
                                latex={v}
                                label={`${test === "chisqgof" ? (c === 0 ? "Observed" : "Expected") : `Group ${c + 1}`} ${r + 1}`}
                                onChange={(value) =>
                                  setTable((old) =>
                                    old.map((row, i) =>
                                      i === r
                                        ? row.map((s, j) =>
                                            j === c ? value : s,
                                          )
                                        : row,
                                    ),
                                  )
                                }
                                onFocus={() => {
                                  const api = fields.current.get(`t${r}:${c}`);
                                  if (api) onFocus(api);
                                }}
                                onEnter={() =>
                                  setTable((old) => [
                                    ...old,
                                    Array(old[0].length).fill(""),
                                  ])
                                }
                                register={(api) => {
                                  if (api)
                                    fields.current.set(`t${r}:${c}`, api);
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="wizard-table-add">
                    <button
                      onClick={() =>
                        setTable((old) => [
                          ...old,
                          Array(old[0].length).fill(""),
                        ])
                      }
                    >
                      + Row
                    </button>
                    {test === "chisqtest" && (
                      <button
                        onClick={() =>
                          setTable((old) => old.map((row) => [...row, ""]))
                        }
                      >
                        + Column
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {Array.from({ length: second ? 2 : 1 }, (_, n) => (
                    <div className="inference-sample" key={n}>
                      <div className="sample-heading">
                        SAMPLE {n + 1}
                        {n === 1 && (
                          <button
                            aria-label="Remove sample 2"
                            onClick={() => setSecond(false)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <table className="wizard-table">
                        <thead>
                          <tr>
                            {labels.map((l) => (
                              <th key={l}>{l}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {labels.map((l, c) => (
                              <td key={c}>
                                {field(`${n}:${c}`, `Sample ${n + 1} ${l}`)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {!second && (
                    <button
                      className="add-sample"
                      onClick={() => setSecond(true)}
                    >
                      ✚ SAMPLE 2 <span>(optional)</span>
                    </button>
                  )}
                </>
              )}
            </div>
            <footer>
              <button
                className="create-inference"
                disabled={!complete}
                onClick={create}
              >
                {test === "distribution"
                  ? "Create Distribution"
                  : "Create Test"}
              </button>
            </footer>
          </>
        ) : (
          <div className="inference-choices">
            <button onClick={() => choose("distribution")}>
              Probability Distribution
            </button>
            <div className="inference-or">
              <span />
              or
              <span />
            </div>
            <p>Inference for Quantitative Data:</p>
            <div className="test-pair">
              <button onClick={() => choose("ztest")}>{TITLES.ztest}</button>
              <button onClick={() => choose("ttest")}>{TITLES.ttest}</button>
            </div>
            <p>Inference for Categorical Data:</p>
            {(["zproptest", "chisqtest", "chisqgof"] as const).map((t) => (
              <button key={t} onClick={() => choose(t)}>
                {TITLES[t]}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
