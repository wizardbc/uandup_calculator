// Six-dot computer braille encoding; Nemeth and UEB mathematical notation.
// Back translation is independent of the forward translator and keeps incomplete
// fractions/radicals editable. Unknown cells produce an error, never a guessed value.
const ascii = [
  " ",
  "A",
  "1",
  "B",
  "'",
  "K",
  "2",
  "L",
  "@",
  "C",
  "I",
  "F",
  "/",
  "M",
  "S",
  "P",
  '"',
  "E",
  "3",
  "H",
  "9",
  "O",
  "6",
  "R",
  "^",
  "D",
  "J",
  "G",
  ">",
  "N",
  "T",
  "Q",
  ",",
  "*",
  "5",
  "<",
  "-",
  "U",
  "8",
  "V",
  ".",
  "%",
  "[",
  "$",
  "+",
  "X",
  "!",
  "&",
  ";",
  ":",
  "4",
  "\\",
  "0",
  "Z",
  "7",
  "(",
  "_",
  "?",
  "W",
  "]",
  "#",
  "Y",
  ")",
  "=",
];
const letters = "⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵";
const nemethDigits = "⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔",
  uebDigits = "⠚⠁⠃⠉⠙⠑⠋⠛⠓⠊";
export function sixDotCells(input: string): string {
  return [...input]
    .map((c) => {
      const n = c.codePointAt(0)!;
      if (n >= 0x2800 && n <= 0x28ff)
        return String.fromCodePoint(0x2800 + ((n - 0x2800) & 63));
      if (c === "\n" || c === "\r" || c === "\t") return "⠀";
      const at = ascii.indexOf(c.toUpperCase());
      if (at < 0) throw new Error(`Unrecognized Braille cell: ${c}`);
      return String.fromCodePoint(0x2800 + at);
    })
    .join("");
}
const nemethOps: Record<string, string> = {
  "⠐⠅⠱": "\\le ",
  "⠨⠂⠱": "\\ge ",
  "⠌⠨⠅": "\\ne ",
  "⠐⠅": "<",
  "⠨⠂": ">",
  "⠨⠅": "=",
  "⠈⠡": "\\times ",
  "⠨⠌": "\\div ",
  "⠸⠌": "/",
  "⠈⠴": "%",
  "⠈⠱": "\\sim ",
  "⠈⠷": "[",
  "⠈⠾": "]",
  "⠨⠷": "\\{",
  "⠨⠾": "\\}",
  "⠨⠡": "^{\\circ}",
  "⠷": "(",
  "⠾": ")",
  "⠬": "+",
  "⠤": "-",
  "⠡": "\\cdot ",
  "⠯": "!",
  "⠳": "|",
  "⠠⠀": ",",
  "⠪": ",",
  "⠠": ",",
  "⠨⠏": "\\pi ",
  "⠨⠹": "\\theta ",
  "⠨⠁": "\\alpha ",
  "⠨⠃": "\\beta ",
  "⠨⠍": "\\mu ",
  "⠨⠎": "\\sigma ",
  "⠨⠠⠎": "\\sum ",
  "⠨⠠⠏": "\\prod ",
  "⠠⠎": "\\sum ",
  "⠮": "\\int ",
  "⠐⠂": ":",
  "⠨⠲": ":",
  "⠠⠄": "'",
  "⠄": "'",
};
const uebOps: Record<string, string> = {
  "⠐⠶": "=",
  "⠐⠖": "+",
  "⠐⠤": "-",
  "⠐⠦": "\\times ",
  "⠐⠲": "\\cdot ",
  "⠐⠌": "\\div ",
  "⠸⠈⠣": "\\le ",
  "⠸⠈⠜": "\\ge ",
  "⠈⠣": "<",
  "⠈⠜": ">",
  "⠐⠶⠈⠱": "\\ne ",
  "⠐⠣": "(",
  "⠐⠜": ")",
  "⠨⠣": "[",
  "⠨⠜": "]",
  "⠸⠣": "\\{",
  "⠸⠜": "\\}",
  "⠸⠳": "|",
  "⠸⠌": "/",
  "⠨⠴": "%",
  "⠈⠔": "\\sim ",
  "⠨⠏": "\\pi ",
  "⠨⠹": "\\theta ",
  "⠘⠁": "\\alpha ",
  "⠘⠃": "\\beta ",
  "⠘⠍": "\\mu ",
  "⠘⠎": "\\sigma ",
  "⠮": "\\int ",
  "⠠⠨⠎": "\\sum ",
  "⠠⠨⠏": "\\prod ",
  "⠈⠮": "\\int ",
  "⠨⠠⠎": "\\sum ",
  "⠨⠠⠏": "\\prod ",
  "⠖": "!",
  "⠂": ",",
  "⠒": ":",
  "⠄": "'",
};
const operators =
  "arccosh arcsinh arctanh arccsc arccot arcsec arcsin arccos arctan stdevp stdev normaldist uniformdist binomialdist poissondist geodist chisqdist tdist inversecdf chisqgof chisqtest zproptest ztest ttest conf estimate stderr dof score pleft pright lower upper null stats quantile quartile histogram dotplot boxplot polygon distance midpoint repeat shuffle unique floor round total length count median mean variance varp var covp cov corr spearman mad sinh cosh tanh csch sech coth sin cos tan csc sec cot sqrt real imag conj arg exp abs log ln ceil sign mod lcm gcd join sort pdf cdf random tone rgb hsv"
    .split(" ")
    .sort((a, b) => b.length - a.length);
export function brailleToLatex(input: string, code: "Nemeth" | "UEB"): string {
  const s = sixDotCells(input);
  let at = 0,
    numeric = false;
  const ops = code === "Nemeth" ? nemethOps : uebOps,
    keys = Object.keys(ops).sort((a, b) => b.length - a.length);
  const digits = code === "Nemeth" ? nemethDigits : uebDigits;
  function scan(stops: string[] = [], single = false, level = ""): string {
    let result = "";
    let depth = 0;
    while (at < s.length) {
      if (stops.some((t) => s.startsWith(t, at))) break;
      const cell = s[at];
      if (
        code === "UEB" &&
        (s.startsWith("⠰⠰⠰", at) || s.startsWith("⠰⠄", at))
      ) {
        at += s.startsWith("⠰⠰⠰", at) ? 3 : 2;
        numeric = false;
        continue;
      }
      const script =
        code === "Nemeth" ? /^[⠘⠰]+/.exec(s.slice(at))?.[0] : undefined;
      if (code === "Nemeth" && level) {
        if (
          cell === "⠐" ||
          (script &&
            (script.length < level.length || !script.startsWith(level)))
        )
          break;
        if (script === level) {
          at += script.length;
          continue;
        }
      }
      const fraction =
        code === "Nemeth" ? /^⠠*⠹/.exec(s.slice(at))?.[0] : undefined;
      const radical =
        code === "Nemeth" ? /^⠨*⠜/.exec(s.slice(at))?.[0] : undefined;
      if (fraction) {
        const prefix = fraction.slice(0, -1),
          mid = prefix + "⠌",
          end = prefix + "⠼";
        at += fraction.length;
        const numerator = scan([mid, end]);
        if (s.startsWith(mid, at)) at += mid.length;
        const denominator = scan([end]);
        if (s.startsWith(end, at)) at += end.length;
        result += `\\frac{${numerator}}{${denominator}}`;
        numeric = false;
        if (single) break;
        continue;
      }
      if (radical) {
        const end = radical.slice(0, -1) + "⠻";
        at += radical.length;
        const body = scan([end]);
        if (s.startsWith(end, at)) at += end.length;
        result += `\\sqrt{${body}}`;
        numeric = false;
        if (single) break;
        continue;
      }
      if (code === "Nemeth" && cell === "⠣") {
        at++;
        const index = scan(["⠜"]);
        if (s[at] === "⠜") at++;
        const body = scan(["⠻"]);
        if (s[at] === "⠻") at++;
        result += `\\sqrt[${index}]{${body}}`;
        numeric = false;
        if (single) break;
        continue;
      }
      if (code === "Nemeth" && script) {
        at += script.length;
        const body = scan([], false, script);
        result += `${script.endsWith("⠘") ? "^" : "_"}{${body}}`;
        numeric = false;
        if (single) break;
        continue;
      }
      if (cell === "⠠" && letters.includes(s[at + 1] ?? "")) {
        at++;
        result += String.fromCharCode(65 + letters.indexOf(s[at++]));
        numeric = false;
        if (single) break;
        continue;
      }
      const op = keys.find((k) => s.startsWith(k, at));
      if (op) {
        at += op.length;
        result += ops[op];
        if (ops[op] !== ",") numeric = false;
        if (single) break;
        continue;
      }
      if (cell === "⠀") {
        at++;
        numeric = false;
        if (single) break;
        result += " ";
        continue;
      }
      if (code === "UEB" && (cell === "⠩" || s.startsWith("⠰⠩", at))) {
        at += cell === "⠩" ? 1 : 2;
        let index = "";
        if (s[at] === "⠔") {
          at++;
          index = scan([], true).replace(/^\{(.*)\}$/s, "$1");
        }
        const body = scan(["⠬", "⠰⠬"]);
        if (s.startsWith("⠰⠬", at)) at += 2;
        else if (s[at] === "⠬") at++;
        result += `\\sqrt${index ? `[${index}]` : ""}{${body}}`;
        numeric = false;
      } else if (code === "UEB" && cell === "⠷") {
        at++;
        const a = scan(["⠨⠌", "⠾"]);
        if (s.startsWith("⠨⠌", at)) at += 2;
        const b = scan(["⠾"]);
        if (s[at] === "⠾") at++;
        result += `\\frac{${a}}{${b}}`;
        numeric = false;
      } else if (code === "UEB" && cell === "⠣") {
        at++;
        const body = scan(["⠜"]);
        if (s[at] === "⠜") at++;
        result += `{${body}}`;
      } else if (code === "UEB" && (cell === "⠔" || cell === "⠢")) {
        at++;
        const body = scan([], true);
        result += `${cell === "⠔" ? "^" : "_"}{${body.replace(/^\{(.*)\}$/s, "$1")}}`;
        numeric = false;
      } else if (cell === "⠼") {
        at++;
        numeric = true;
        continue;
      } else if (
        (code === "Nemeth" && cell === "⠐") ||
        (code === "UEB" && cell === "⠰")
      ) {
        at++;
        numeric = false;
        continue;
      } else if (cell === "⠠" && letters.includes(s[at + 1] ?? "")) {
        at++;
        result += String.fromCharCode(65 + letters.indexOf(s[at++]));
        numeric = false;
      } else if (
        ((code === "Nemeth" || numeric) && digits.includes(cell)) ||
        (code === "UEB" && numeric && cell === "⠲")
      ) {
        let number = "";
        while (
          at < s.length &&
          (digits.includes(s[at]) ||
            (code === "Nemeth"
              ? s[at] === "⠨" && digits.includes(s[at + 1] ?? "")
              : s[at] === "⠲"))
        ) {
          const d = digits.indexOf(s[at++]);
          number += d < 0 ? "." : d.toString();
        }
        if (code === "UEB" && s[at] === "⠌") {
          at++;
          let denominator = "";
          while (at < s.length && digits.includes(s[at]))
            denominator += digits.indexOf(s[at++]);
          result += `\\frac{${number}}{${denominator}}`;
        } else if (
          code === "Nemeth" &&
          /[a-zA-Z]$/.test(result) &&
          /^[0-9]+$/.test(number)
        )
          result += `_{${number}}`;
        else result += number;
      } else if (letters.includes(cell)) {
        at++;
        result += String.fromCharCode(97 + letters.indexOf(cell));
        numeric = false;
      } else if (cell === "⠨" && code === "Nemeth") {
        at++;
        result += ".";
      } else if (cell === "⠌") {
        at++;
        result += "/";
      } else {
        throw new Error(`Unrecognized ${code} notation at cell ${at + 1}.`);
      }
      if (single) break;
      if (++depth > 8192)
        throw new Error("The Braille expression is too long.");
    }
    return result;
  }
  let latex = scan();
  // Name recognition is limited to calculator operators; other letter sequences
  // remain implicit multiplication, just as in the expression editor.
  latex = latex.replace(/(?<!\\)(?<![A-Za-z])[a-zA-Z]+(?![A-Za-z])/g, (word) =>
    operators.includes(word) ? `\\operatorname{${word}}` : word,
  );
  return latex.trim();
}
