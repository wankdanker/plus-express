# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`plus-express` (npm name; repo dir is `express-plus`) wraps Express 4/5 apps and routers so route methods accept a Zod-based options object, which both validates requests at runtime and registers the route in an OpenAPI 3.0 document (via `@asteasolutions/zod-to-openapi`). Express is a peer dependency. Zod is v4.

## Commands
The repo uses pnpm only (version pinned with its hash in `package.json` `packageManager`; `corepack enable pnpm` installs it). Don't add a `package-lock.json`.

- **Install**: `pnpm install`
- **Build**: `pnpm run build` (`tsc -p tsconfig.build.json` → `dist/`; excludes test files)
- **Test (watch)**: `pnpm test` — Vitest runs in watch mode by default
- **Test (single run, as CI does)**: `pnpm run test:ci`
- **Test a single file**: `pnpm vitest run src/express-plus.test.ts`; filter by name with `-t "pattern"`
- **Coverage**: `pnpm run test:coverage`
- **Lint**: `pnpm run lint` / `pnpm run lint:fix` (oxlint with type-aware rules, configured in `.oxlintrc.json`; it honors `// oxlint-disable-next-line <rule>` comments)
- **Type check**: `pnpm run type-check` (uses `tsconfig.json`, which includes the tests)
- **Demo**: `pnpm run demo` (runs `example.ts` with tsx)

Dev tooling needs Node ≥22.12 (Vitest 5). CI (`.github/workflows/ci.yml`) runs lint, type-check, `test:ci`, and build on every PR and on pushes to `main`, across Node 22/24 × Express 4/5. Express 4 is installed over the lockfile's Express 5 with `pnpm add --save-dev express@4`. TypeScript is 7.x (the Go-based compiler); oxlint's type-aware rules (`oxlint-tsgolint`) are built on the same compiler, which is why it replaced ESLint, whose TypeScript plugin didn't support TypeScript 7.

`pnpm-workspace.yaml` holds pnpm's supply-chain settings: versions younger than 7 days aren't resolved (`minimumReleaseAge`, matching Dependabot's cooldown), and installs fail when a new dependency wants to run a build script until it's approved or ignored there. pnpm stays on 10.x because Dependabot and GitHub's dependency graph can't read pnpm 12's two-document lockfile yet.

## Architecture

Everything lives in `src/`. The main moving parts:

- **`index.ts`**: public entry point. `plus(appOrRouter?, opts?)` dispatches on duck typing: a target with `listen()` goes to `expressPlus`, anything else goes to `routerPlus`, and no argument creates a new Router. It also calls `extendZodWithOpenApi(z)` and re-exports `z`, so users should import `z` from this package.
- **`registry.ts`** (`createRegistry`): one registry per app/router. It wraps an `OpenAPIRegistry` and holds the mutable defaults (query/header schemas, responses) plus the chainable builder methods (`setInfo`, `addServer`, …). `createEndpoint(method, path, opts)` registers the path with OpenAPI (it converts `:param` to `{param}`) and returns the validation middleware. Defaults are merged when each route is defined, so calling `setDefault*` afterwards does not affect routes already registered.
- **`utils.ts`**: `enhanceHttpMethods` monkey-patches `get/post/put/delete/patch/options/head` on the target. It handles two call shapes: `(optionsWithPath, ...handlers)` and `(path, options, handler, ...)`. Both inject the validation middleware before the handlers. Any other call shape falls through to plain Express.
- **`express-plus.ts` / `router-plus.ts`**: wrap `use()` and call `recordRouterPlusMount` (`utils.ts`), which reads the arguments the way Express does (optional path or array of paths, then handlers, possibly nested in arrays) and records every mounted RouterPlus (detected through the non-enumerable `_isRouterPlus`, `_registry` and `_nestedMountRegistry` properties) as a `MountInfo` tree. Each entry keeps a reference to the mounted router's own nested-mount list, so routers nested later are still found. `expressPlus` passes its mount list to `createRegistry`; on each `generateOpenAPIDocument()` call, `collectMountedDefinitions` builds the mounted routers' definitions (routes with the full mount path prepended, plus components) without modifying any registry, and `assertCompatibleComponents` throws if two registries define a component name differently. Routers don't get their mount list, so a router's own `generateOpenAPIDocument` covers just that router's routes.
- **`types.ts`**: all shared types. `AugmentedMethod<T>` provides the typed overloads that infer handler `req.parsed` types from the Zod schemas. `ExpressPlusApplication` and `RouterPlus` `Omit` and then redeclare the HTTP methods and `use()`. `Omit` drops call signatures, so both re-add them explicitly (otherwise `http.createServer(app)` and `request(app)` fail to type-check). `AnyZodObject` is the bound for object-schema generics; use it instead of `ZodObject<any>`.

### Validation behavior
- Validated values go to `req.parsed.{body,params,query,headers}` and are also written back onto `req.body`/`req.params`/`req.query`/`req.headers` for compatibility. On Express 5, `req.query` is a getter that re-parses on every access, so the middleware shadows it with an own property holding the merged values.
- Query and header schemas are always run, merged with the defaults. Headers are validated with `.partial()`.
- On failure, the middleware calls `next(err)` with `err.status = 400`, `err.message = 'Validation failed'`, `err.errors` set to the Zod issues, and `err.cause` set to the `ZodError`. It does not send a response itself, so formatting is left to the app's error handler.

After generation, `requirePathParameters` and `documentCoercedParameters` (`utils.ts`) correct parameter docs that zod-to-openapi infers by test-parsing: `z.coerce.*` schemas accept `null` and so come out optional and nullable.

### Known gaps
- Routers mounted under a RegExp path are documented as if mounted at the root, since OpenAPI can't express the pattern.
- The remaining lint warnings are deliberate: `generateOpenAPIDocument(): any` and `registerSecurityScheme(scheme: any)` are public types, and tightening them would break consumers' compilation, so leave them for a major version.

Tests use Vitest and supertest against real Express apps, split by area in `src/`: `validation`, `openapi`, `routing`, `api` (public exports), `types` (type inference), and the original `express-plus` integration suite. `types.test.ts` uses `expectTypeOf` and `@ts-expect-error`, which only `pnpm run type-check` enforces (Vitest doesn't type-check), so run both. Known gaps are tracked as `it.todo`.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-facing change (public API, types, runtime behavior, dependencies consumers install) gets an entry under `## [Unreleased]` in the same PR, in the matching category (Added, Changed, Deprecated, Removed, Fixed, Security), with a PR link reference like `([#6])` plus a matching `[#6]: …/pull/6` link at the bottom. Skip internal-only changes (CI, dev tooling, tests, refactors with no visible effect). Call out anything that could break consumers.

Releases go through `pnpm version <patch|minor|major>` (`npm version` works the same) on an up-to-date `main`, then `git push --follow-tags`. `scripts/changelog.mjs` runs as `preversion` (refuses to release with an empty `[Unreleased]`) and `version` (moves the entries under `## [X.Y.Z] - date`, updates the compare links, and stages the file into the version commit). Don't move entries by hand.

Pushing the `vX.Y.Z` tag runs `.github/workflows/release.yml`. It runs the full CI matrix (`ci.yml` via `workflow_call`), checks the tag matches `package.json` and is on `main`, builds the release notes from the changelog section (`changelog.mjs notes`), installs with pnpm, publishes with `npm publish` using npm trusted publishing (OIDC in the `npm` GitHub environment, no token, automatic provenance), and creates the GitHub release. Prerelease versions (`X.Y.Z-beta.N`) publish to the `next` dist-tag. Don't publish from a local machine.

Repository protections (configured in GitHub settings, not files):
- The `npm` environment only accepts `v*` tags and requires the maintainer's approval in the Actions tab, so the publish job waits after tests pass.
- Rulesets: `main` requires PRs and the four CI checks (no force-push or deletion); `v*` tags can only be created by admins and can't be moved or deleted. Admins bypass both, which is how the `npm version` commit and tag are pushed directly.
- Immutable releases are on, so a published GitHub release and its tag can't be changed.
- Allowed actions are restricted to GitHub-owned actions pinned to full commit SHAs (keep the `# vX.Y.Z` comment next to each pin). Dependabot (`.github/dependabot.yml`, 7-day cooldown) updates pins and dependencies; CodeQL default setup scans TypeScript and workflows.
- Merged PR branches are deleted automatically, so stacked PRs retarget to their parent's base.

## Code Style Guidelines
- **Indentation**: 2 spaces
- **Formatting**: Semicolons required, trailing commas in multi-line structures
- **Imports**: Framework/libraries first, local modules second; named imports preferred
- **Types**: Strong TypeScript typing throughout, Zod for validation, generics when appropriate
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces/classes
- **Documentation**: JSDoc comments for exported functions
- **Error Handling**: Try/catch for external dependencies, explicit error messages with context
- **Architecture**: Builder pattern for configuration, middleware-based approach
- **Type Exports**: Use dedicated types.ts file for shared types
