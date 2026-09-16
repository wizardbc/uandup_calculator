# U&UP Calculator

**[Open the live calculator](https://wizardbc.github.io/uandup_calculator/)** · [Scientific mode](https://wizardbc.github.io/uandup_calculator/?mode=scientific)

The public demo runs on GitHub Pages and does not depend on a local development server. Updates to `main` deploy automatically after the build and tests pass.

A self-hosted graphing and scientific calculator for SAT practice interfaces. React and TypeScript provide the interface; a Rust/WebAssembly engine runs in a dedicated Web Worker. All calculation runs in the browser. No API key, paid calculator service, analytics, or external runtime request is required.

The desktop layout follows measurements of the public College Board testing calculators. It uses the U&UP identity and independently written interface code. This is an independent project, with no affiliation or endorsement from College Board or Desmos.

## Run locally

Requirements: Node.js 22.12+ (tested with 24.21), npm, and [Rust/rustup](https://rustup.rs/). The Rust version and WASM target are pinned in `rust-toolchain.toml`.

```sh
npm ci
cargo install wasm-bindgen-cli --version 0.2.128 --locked
npm run build:wasm
npm run dev
```

Open `http://localhost:5173`. Use HTTPS or localhost: browser module Workers and some clipboard features require a secure context. When Rust files change, run `npm run build:wasm` again; TypeScript and styles reload automatically.

```sh
npm run build
npm run preview
```

Deploy the entire `dist/` directory to any static HTTPS host, including its `wasm/`, `source/`, and `licenses/` directories. Serve `.wasm` as `application/wasm`; the loader also supports a non-streaming fallback. Relative assets support a directory such as `/calculator/`. Preserve the trailing slash. Runtime files may be cached for offline use by the host application; this project does not install a service worker or persist examination state automatically.

## Embed

```html
<iframe
  id="calculator"
  title="Practice calculator"
  src="https://calculator.example/?hostOrigin=https%3A%2F%2Fcbt.example"
  style="width: 100%; height: 750px; border: 0"
></iframe>
```

`?mode=scientific` starts in scientific mode. `?embed=1` hides the header, including its calculator switch; the host can switch modes through state. Without `hostOrigin`, cross-window control is disabled. If sandboxing the iframe, include `allow-scripts allow-same-origin`; host and calculator should have separate origins. No cross-origin isolation or `SharedArrayBuffer` is needed.

Wait for a message with `{channel: "uandup-calculator", version: 1, type: "ready"}`. It means the interface API is installed; calculation initialization completes asynchronously. Check the sender's origin and that `event.source === iframe.contentWindow` in the host.

```js
const calculator = document.querySelector("#calculator");
calculator.contentWindow.postMessage(
  {
    channel: "uandup-calculator",
    version: 1,
    requestId: "save-1",
    type: "getState",
  },
  "https://calculator.example",
);
```

| Request    | Additional fields                  | Reply                  |
| ---------- | ---------------------------------- | ---------------------- |
| `getState` | none                               | `type: "state", state` |
| `setState` | `state` from a previous `getState` | `ack` or `error`       |
| `reset`    | none                               | `ack`                  |
| `focus`    | none                               | `ack`                  |

Replies preserve `requestId`, `channel`, and `version`. State contains independent graphing/scientific histories, angle modes, graph bounds and styles. Retain its version and unique expression IDs. See `src/types.ts` for the schema. The host owns save/restore and examination lifecycle. `reset` clears both modes while preserving the current mode; the interface's “clear all” clears only the visible mode.

For same-origin integration and diagnostics, `window.UandupCalculator` exposes `getState()`, `setState(state)`, `reset()`, and `getDiagnostics()`. Diagnostics report actual WASM execution time, engine readiness, and engine errors. The evaluation counter counts interpreter visits, not compiled numeric instructions.

## Implemented behavior

- Graphing/scientific mode switch, expression history, undo/redo, physical and on-screen keyboards, fraction/root input, table paste, sliders and animation, graph styles, settings, pan/zoom/pinch and coordinate tracing.
- Real arithmetic, powers, trigonometry, logarithms, factorial/combinatorics, user variables and functions, lists, statistics, restrictions and piecewise expressions.
- Explicit and implicit plots, inequalities, points, parametric and polar curves. Numerical intercepts, extrema, explicit intersections/tangencies and implicit/vertical intersections.
- Finite definite integrals, numerical derivatives, finite sums/products, common probability distributions and list-based linear/nonlinear regression with selectable log mode.
- Desktop and small-screen layouts, keyboard navigation, DesQuill math speech, contrast/text-size controls, and a basic audible scan of the selected curve.

The numeric engine uses double precision. A compiled expression program accelerates repeated graph evaluation inside WASM. Adaptive sampling and refined marching squares feed transferable geometry buffers to Canvas 2D. Requests are coalesced, stale results discarded, and long-running Workers restarted after five seconds.

## Compatibility and limits

This is a usable independent implementation, **not full feature or pixel parity** with the reference. The public testing pages were inspected; the installed Bluebook application's surrounding window was not tested. Brand text, custom icons, some settings/function menus, table/regression details and the responsive layout differ.

Complex-number mode, Braille modes, statistical inference, custom colors/sounds, full accessibility/audio-trace parity, symbolic algebra, list comprehensions, arbitrary table columns and all reference function syntaxes are not implemented. Parametric curves currently use `0 ≤ t ≤ 1`; polar curves use `0 ≤ θ ≤ 2π`. Finite numerical calculus and nonlinear regression have ordinary numerical limitations; very narrow/discontinuous features and ill-conditioned fits need independent checking. General implicit intersections use numerical refinement and may miss solutions. Large states, deep expressions and expensive computations are bounded. The engine is not a CAS and has not been certified for an official examination.

Automated tests exercise Chromium, Firefox, WebKit and an iPhone-sized WebKit viewport. These are browser-engine/emulation tests on Linux, not physical iPad/iPhone validation or a guarantee for every older browser. Current desktop Chrome/Edge/Firefox/Safari and current iPad Safari are the intended targets. No speed comparison with the reference calculator is claimed.

## Tests

```sh
npm run test:engine
npx playwright install --with-deps chromium firefox webkit
npm run build
TEST_PRODUCTION=1 npm test
```

The browser suite checks real WASM startup, expression/keypad editing, results, undo, mode preservation, sliders, table paste/regression, intersections, settings/errors, state validation, iframe messaging, and mobile layout. Engine tests include calculus, distribution fixtures, bytecode/interpreter equivalence, small implicit curves, dependency errors and resource bounds. Tests are included in the public repository; proprietary reference captures are not.

## License

Original application and engine code: **BSD Zero Clause (0BSD)**, allowing commercial use and redistribution without an attribution condition. DesQuill remains **MPL-2.0**, and other dependencies retain their licenses; this repository does not relicense them as 0BSD. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [the dependency inventory](licenses/dependency-inventory.json).

The build includes required notices and the vendored DesQuill source. The U&UP logo opens `licenses.html` for recipients. Keep these materials with redistributed builds; changes to covered MPL files remain subject to MPL source-availability requirements.
