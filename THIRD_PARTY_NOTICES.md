# Third-party notices

Original MathAI application and Rust engine code is licensed under 0BSD. The following components keep their original terms. The complete dependency inventory, versions and license-file paths are in `licenses/dependency-inventory.json`; this includes build and test tooling, not only shipped runtime code. Lockfiles pin resolved packages.

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
- Temml 0.13.5: MIT, Ron Kok and contributors; `licenses/npm/temml/LICENSE`. Used to produce MathML for Braille translation.

## Rust/WASM dependencies

`num-complex` provides complex arithmetic (MIT option selected; Apache-2.0 notice also retained). `statrs` provides probability distribution functions and is MIT-licensed. `wasm-bindgen`, Serde, serde_json and their transitive dependencies have their own MIT, Apache-2.0, Unicode or dual-license notices under `licenses/rust/`. For dependencies offered under MIT OR Apache-2.0, this distribution uses the MIT option; notices for both are retained. Apache-only and Unicode-specific components retain their respective terms.

MathCAT 0.7.6-rc.3, DAISY Consortium and contributors, translates MathML into Nemeth and UEB Braille in a separate WASM module. Its Rust code and bundled translation rules are MIT-licensed; see `licenses/rust/mathcat/`. Source: <https://github.com/DAISY/MathCAT>. The independent input back-translator is original MathAI code. The proprietary Abraham library is not included.

MathCAT's transitive dependency `option-ext` 0.2.0 is MPL-2.0. Unmodified corresponding source is provided in `third_party/option-ext/` and `source/option-ext/` in the built distribution. Other dependencies retain their MIT, Apache-2.0, BSD, Unicode-3.0, Zlib or bzip2-1.0.6 terms, identified individually in the inventory. For `roman-numerals-rs`, the 0BSD option is selected; for Unlicense OR MIT dependencies, MIT is selected. Full upstream notices are retained, including alternative license texts where supplied.

## Build and test tooling

Vite, Rolldown, React's Vite plugin, TypeScript, Sass, Playwright, Prettier and transitive build packages are development dependencies. Their MIT, Apache-2.0, BSD and other applicable texts are included in `licenses/npm/`. Platform-specific optional binaries are resolved by npm for the build machine and may vary by platform.

The build copies this notice, original license texts, the dependency inventory and corresponding MPL-covered source into the distributable directory. Public source: <https://github.com/wizardbc/uandup_calculator>.

Palette 0.7.6 and its matching palette_derive 0.7.6 provide sRGB, HSV and Oklab family color conversions in the calculation WASM module. MIT option selected; full upstream MIT and Apache-2.0 notices are retained under `licenses/rust/`. Source: <https://github.com/Ogeon/palette>. The matching derive version is pinned in Cargo.lock for reproducible builds.
