import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

mkdirSync("public", { recursive: true });
for (const name of ["licenses", "source"])
  rmSync(join("public", name), { recursive: true, force: true });
cpSync("licenses", "public/licenses", { recursive: true });
cpSync("third_party/desquill", "public/source/desquill", { recursive: true });
cpSync("third_party/option-ext", "public/source/option-ext", {
  recursive: true,
});
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  cpSync(name, join("public", name));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(directory, e.name))
      : [join(directory, e.name)],
  );
}
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const list = files("public/source")
  .sort()
  .map(
    (file) =>
      `<li><a href="${escape(relative("public/source", file))}">${escape(relative("public/source", file))}</a></li>`,
  )
  .join("\n");
writeFileSync(
  "public/source/index.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Corresponding source</title><body><h1>Corresponding source</h1><p>DesQuill and option-ext: preferred source forms used by this build, provided under MPL-2.0. <a href="../licenses.html">License notices</a>.</p><ul>${list}</ul></body></html>`,
);
