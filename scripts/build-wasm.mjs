import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error)
    throw new Error(
      `${command} is required: ${result.error.message}. See README.md.`,
    );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync("public/wasm", { recursive: true });
run("cargo", [
  "build",
  "--locked",
  "--release",
  "--target",
  "wasm32-unknown-unknown",
  "--manifest-path",
  "engine/Cargo.toml",
]);
run("wasm-bindgen", [
  "engine/target/wasm32-unknown-unknown/release/uandup_engine.wasm",
  "--target",
  "web",
  "--out-dir",
  "public/wasm",
  "--out-name",
  "uandup_engine",
]);
