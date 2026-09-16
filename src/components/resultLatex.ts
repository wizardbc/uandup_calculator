export function resultLatex(display: string): string {
  return display
    .replace(/([\d.]+)e([+-]?\d+)/gi, "$1\\times10^{$2}")
    .replace(/∞/g, "\\infty")
    .replace(/−/g, "-")
    .replace(/undefined/g, "\\operatorname{undefined}")
    .replace(/…/g, "\\ldots");
}
export function numberLatex(value:number,precision?:number):string {
  if(Number.isNaN(value))return "0/0";
  return resultLatex(String(precision===undefined?value:Number(value.toPrecision(precision))));
}
