# @a-company/atelier-hyperframes-adapter

The v2 Atelier renderer bridge. It turns a creator project (DESIGN / SCRIPT / STORYBOARD artifacts plus media and transcripts) into a [Hyperframes](https://github.com/heygen-com/hyperframes) project directory, and can render that directory to MP4 through `@hyperframes/producer`.

## Install

Scaffolding and translation only:

```sh
npm i @a-company/atelier-hyperframes-adapter
```

To render as well, add the producer:

```sh
npm i @a-company/atelier-hyperframes-adapter @hyperframes/producer@^0.8.214
```

## `@hyperframes/producer` is an optional peer dependency (0.1.0+)

Up to 0.0.2 the adapter depended on `@hyperframes/producer` directly, so every install pulled in puppeteer and Chrome tooling, and a fresh install audited at 13 vulnerabilities (12 high, 1 moderate). Even the latest producer, 0.8.214, still audits at 6 high: `@hyperframes/engine` and the producer pin `puppeteer ~25.11.0`, whose `chromium-bidi` 17.0.2 depends on zod 3.25.76 (GHSA-mrhx-c7xc-m3w5, fixed only in zod 4.6.6+). These advisories come from upstream, not from the adapter.

From 0.1.0 the producer is an optional peer dependency:

- The adapter alone installs with 0 vulnerabilities.
- `scaffoldHyperframesProject`, `designToCss`, `storyboardToHtml` and `injectAssets` work without the producer.
- `runRender` loads the producer on its first call. If it isn't installed, it throws `Install @hyperframes/producer@^0.8.214 to render Hyperframes projects ...`.
- Installing the producer brings its upstream advisories with it, until Hyperframes moves to a puppeteer whose `chromium-bidi` uses zod 4.6.6 or later.

Until then, this npm `overrides` entry in your own `package.json` installs producer 0.8.214 at 0 vulnerabilities (puppeteer 25.13 and later use a `chromium-bidi` built on zod 4):

```json
{ "overrides": { "puppeteer": "^25.13.0" } }
```

Upgrading from 0.0.2: if you call `runRender`, add `@hyperframes/producer@^0.8.214` to your own dependencies. Nothing else changes.

## API

| Export | What it does |
|--------|--------------|
| `scaffoldHyperframesProject(opts)` | Writes `index.html`, `meta.json` and `assets/` for a Hyperframes project. Idempotent. |
| `designToCss(brand)` | DESIGN brand palette and typography to `:root` CSS variables. Pure. |
| `storyboardToHtml(input)` | A video file plus transcript segments to a Hyperframes `index.html` with timed captions. Pure. |
| `injectAssets(opts)` | Symlinks (or copies) media into the project's `assets/`. |
| `runRender(opts)` | Renders a scaffolded project to MP4 (H.264, quality `high`). Needs `@hyperframes/producer`. |

Rendering also needs ffmpeg and Chrome; `npx hyperframes doctor` checks them.
