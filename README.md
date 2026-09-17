# MathAI Calculator

**[Open the live calculator](https://wizardbc.github.io/uandup_calculator/)** · [Scientific mode](https://wizardbc.github.io/uandup_calculator/?mode=scientific)

The public demo runs on GitHub Pages and does not depend on a local development server. Updates to `main` deploy automatically after the build and tests pass.

A self-hosted graphing and scientific calculator for SAT practice interfaces. React and TypeScript provide the interface; a Rust/WebAssembly engine runs in a dedicated Web Worker. All calculation runs in the browser. No API key, paid calculator service, analytics, or external runtime request is required.

The desktop layout follows measurements of the public College Board testing calculators. It uses the MathAI identity and independently written interface code. This is an independent project, with no affiliation or endorsement from College Board or Desmos.

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

For same-origin integration and diagnostics, `window.MathAICalculator` (also available as `window.UandupCalculator` for existing integrations) exposes `getState()`, `setState(state)`, `reset()`, and `getDiagnostics()`. Diagnostics report actual WASM execution time, engine readiness, and engine errors. The evaluation counter counts interpreter visits, not compiled numeric instructions.

## Appearance

The first visit follows the device's system appearance: **Light** or **Dark**. Open Graph Settings (the wrench), or Settings in scientific mode, to select **Light, Dark, Classic, or High contrast**. Classic preserves the previous calculator layout and colors. The other themes keep the same controls and keypad arrangement while changing colors, graph paper and stroke contrast.

A manual choice is saved in this browser and takes priority over the system appearance. Check **Use system setting** to resume automatic selection, including live system appearance changes. If browser storage is blocked, theme selection still works for the current page. Themes are independent of expressions, calculator state and undo history.

For embedding, `?theme=light`, `?theme=dark`, `?theme=classic`, or `?theme=high-contrast` overrides the saved preference for that page without saving it. This also works with `?embed=1`. Invalid theme values are ignored. Stored plot colors remain unchanged when their displayed colors are adjusted for visibility.

## Implemented behavior

- Independent graphing and scientific histories and angle/complex modes, undo/redo, DesQuill mathematical editing, physical and on-screen keyboards, sliders, animation and state restoration.
- Real and complex arithmetic, user variables/functions, list comprehensions and filters, descriptive statistics, finite numerical calculus, restrictions and piecewise expressions.
- Explicit, implicit, inequality, point, polar and parametric graphs; editable curve domains; logarithmic axes, viewport locking, pan/zoom/pinch and numerical intersections.
- Tables with multiple columns, computed columns, paste, regression model selection, residual variables/plots, and log mode. Histograms, dot plots, box plots and polygons.
- Probability distributions with cumulative regions and inverse bounds; quantitative/proportion/chi-square inference with creation dialogs, confidence intervals, hypothesis tests and result export.
- Custom RGB/HSV/OK color functions, list colors, seeded random samples, audible tones, point shapes, labels and draggable coordinates/variables.
- Nemeth and UEB translation through a separate lazy-loaded MathCAT WASM module, six-key Braille input, contrast/text-size settings, and an audio trace panel with playback, navigation and descriptions.

The numeric engine uses double precision. A compiled expression program accelerates repeated graph evaluation inside WASM. Adaptive sampling and refined marching squares feed transferable geometry buffers to Canvas 2D. Requests are coalesced, stale results discarded, and long-running Workers restarted after five seconds.

## Verification status

Reference comparison is ongoing; this repository does not claim complete visual or behavioral equivalence. The comparison target is the public SAT testing calculator. The installed Bluebook host window and physical assistive devices have not been validated. Numerical calculus, nonlinear regression, implicit intersections, discontinuities and very large or small scales require case-specific checks. General symbolic algebra is outside this numerical engine.

The tests exercise actual numeric and accessibility WASM, mathematical fixtures, Braille value-preserving round trips, editing, graph interactions, inference, distributions, computed tables, regression, point dragging, audio controls and iframe state exchange. Browser projects target Chromium, Firefox, WebKit and a phone-sized WebKit viewport. Automated browser engines and viewport emulation do not substitute for physical device testing. No speed advantage over the reference calculator is claimed.

## Tests

```sh
npm run test:engine
npx playwright install --with-deps chromium firefox webkit
npm run build
npm run test:wasm
TEST_PRODUCTION=1 npm test
```

The browser suite checks real WASM startup, expression/keypad editing, results, undo, mode preservation, sliders, table paste/regression, intersections, settings/errors, state validation, iframe messaging, and mobile layout. Engine tests include calculus, distribution fixtures, bytecode/interpreter equivalence, small implicit curves, dependency errors and resource bounds. Tests are included in the public repository; proprietary reference captures are not.

## License

Original application and engine code: **BSD Zero Clause (0BSD)**, allowing commercial use and redistribution without an attribution condition. DesQuill remains **MPL-2.0**, and other dependencies retain their licenses; this repository does not relicense them as 0BSD. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [the dependency inventory](licenses/dependency-inventory.json).

The build includes required notices and the vendored MPL source for DesQuill and option-ext. MathCAT, Temml and the other dependencies retain their own notices. The MathAI logo opens `licenses.html` for recipients. Keep these materials with redistributed builds; changes to covered MPL files remain subject to MPL source-availability requirements.
