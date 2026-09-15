# Third-party notices

Original U&UP application and Rust engine code is licensed under 0BSD. The following components keep their original terms. The complete dependency inventory, versions and license-file paths are in `licenses/dependency-inventory.json`; this includes build and test tooling, not only shipped runtime code. Lockfiles pin resolved packages.

## DesQuill / MathQuill

- Source: <https://github.com/desmosinc/desquill>
- Vendored revision: `de33da1c698541be6d1252948e55983b2e81055e`
- License: Mozilla Public License 2.0; see `third_party/desquill/LICENSE`, `licenses/MPL-2.0.txt`, original file headers and `third_party/desquill/UPSTREAM_README.md`.
- Corresponding source: `third_party/desquill/` in this repository and `source/desquill/` in the built distribution. `source/index.html` lists every distributed covered file.

DesQuill is the openly published equation editor. No proprietary calculator engine, web bundle, logo, or reference screenshot is included. Upstream source files are retained unchanged; the Vite loader and editor API integration are separate original files. The upstream API differs from older MathQuill APIs. Upstream copyright and attribution notices remain in the source, including the MathQuill contributors.

Nested components retained by that source:

- Underscore.js 1.10.2, Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors: MIT; `licenses/Underscore-MIT.txt` and the source header.
- Flux 3.1.3, Facebook, Inc.: BSD notice and additional patent grant, preserved in `licenses/Flux-BSD.txt` and `licenses/Flux-PATENTS.txt`.
- Embedded legacy Symbola font version 2.52, George Douros: legacy free-use and redistribution notice in `licenses/Symbola.txt`. This identifies the embedded font, not later Symbola releases.

## Browser runtime dependencies

- React, React DOM and Scheduler: MIT, Meta Platforms, Inc. and affiliates. License files are under `licenses/npm/`.
- `@fluent/bundle`: Apache-2.0, Mozilla/Project Fluent contributors; full license under `licenses/npm/@fluent__bundle/`.
- `@lukeed/uuid` and `@lukeed/csprng`: MIT, Luke Edwards; license files under `licenses/npm/`.

## Rust/WASM dependencies

`statrs` provides probability distribution functions and is MIT-licensed. `wasm-bindgen`, Serde, serde_json and their transitive dependencies have their own MIT, Apache-2.0, Unicode or dual-license notices under `licenses/rust/`. For dependencies offered under MIT OR Apache-2.0, this distribution uses the MIT option; notices for both are retained. Apache-only and Unicode-specific components retain their respective terms.

## Build and test tooling

Vite, Rolldown, React's Vite plugin, TypeScript, Sass, Playwright, Prettier and transitive build packages are development dependencies. Their MIT, Apache-2.0, BSD and other applicable texts are included in `licenses/npm/`. Platform-specific optional binaries are resolved by npm for the build machine and may vary by platform.

The build copies this notice, original license texts, the dependency inventory and corresponding DesQuill source into the distributable directory. Public source: <https://github.com/wizardbc/uandup_calculator>.
