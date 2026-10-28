# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`plus-express` (npm name; repo dir is `express-plus`) wraps Express 4/5 apps and routers so route methods accept a Zod-based options object, which both validates requests at runtime and registers the route in an OpenAPI 3.0 document (via `@asteasolutions/zod-to-openapi`). Express is a peer dependency. Zod is v4.

## Commands
- **Build**: `npm run build` (`tsc -p tsconfig.build.json` → `dist/`; excludes test files)
- **Test (watch)**: `npm run test` — Vitest runs in watch mode by default
- **Test (single run, as CI does)**: `npm run test:ci`
- **Test a single file**: `npx vitest run src/express-plus.test.ts`; filter by name with `-t "pattern"`
- **Coverage**: `npm run test:coverage`
- **Lint**: `npm run lint` / `npm run lint:fix`
- **Type check**: `npm run type-check` (uses `tsconfig.json`, which includes the tests)
- **Demo**: `npm run demo` (runs `example.ts` with tsx)

Dev tooling needs Node ≥22.12 (Vitest 5). CI (`.github/workflows/ci.yml`, Node 22 and 24) runs lint, type-check, `test:ci`, and build. Both `package-lock.json` and `pnpm-lock.yaml` are kept in sync; CI uses `npm ci`. TypeScript is held at 6.x because typescript-eslint doesn't support 7 yet.

## Architecture

Everything lives in `src/`. The main moving parts:

- **`index.ts`**: public entry point. `plus(appOrRouter?, opts?)` dispatches on duck typing: a target with `listen()` goes to `expressPlus`, anything else goes to `routerPlus`, and no argument creates a new Router. It also calls `extendZodWithOpenApi(z)` and re-exports `z`, so users should import `z` from this package.
- **`registry.ts`** (`createRegistry`): one registry per app/router. It wraps an `OpenAPIRegistry` and holds the mutable defaults (query/header schemas, responses) plus the chainable builder methods (`setInfo`, `addServer`, …). `createEndpoint(method, path, opts)` registers the path with OpenAPI (it converts `:param` to `{param}`) and returns the validation middleware. Defaults are merged when each route is defined, so calling `setDefault*` afterwards does not affect routes already registered.
- **`utils.ts`**: `enhanceHttpMethods` monkey-patches `get/post/put/delete/patch/options/head` on the target. It handles two call shapes: `(optionsWithPath, ...handlers)` and `(path, options, handler, ...)`. Both inject the validation middleware before the handlers. Any other call shape falls through to plain Express.
- **`express-plus.ts` / `router-plus.ts`**: wrap `use()` and call `recordRouterPlusMount` (`utils.ts`) to record mounted RouterPlus instances (detected through the non-enumerable `_isRouterPlus`, `_registry` and `_nestedMountRegistry` properties) as a `MountInfo` tree. Each entry keeps a reference to the mounted router's own nested-mount list, so routers nested later are still found. `expressPlus` also overrides `registry.generateOpenAPIDocument`: each time it is called, `registerMountedRoutes` walks that tree and re-registers every mounted router's routes into the app's registry with the full mount path prepended. Only the app combines registries; calling a router's own `generateOpenAPIDocument` covers just that router's routes.
- **`types.ts`**: all shared types. `AugmentedMethod<T>` provides the typed overloads that infer handler `req.parsed` types from the Zod schemas. `ExpressPlusApplication` and `RouterPlus` `Omit` and then redeclare the HTTP methods and `use()`. `Omit` drops call signatures, so both re-add them explicitly (otherwise `http.createServer(app)` and `request(app)` fail to type-check). `AnyZodObject` is the bound for object-schema generics; use it instead of `ZodObject<any>`.

### Validation behavior
- Validated values go to `req.parsed.{body,params,query,headers}` and are also written back onto `req.body`/`req.params`/`req.query`/`req.headers` for compatibility. On Express 5, `req.query` is a getter that re-parses on every access, so the middleware shadows it with an own property holding the merged values.
- Query and header schemas are always run, merged with the defaults. Headers are validated with `.partial()`.
- On failure, the middleware calls `next(err)` with `err.status = 400`, `err.message = 'Validation failed'`, `err.errors` set to the Zod issues, and `err.cause` set to the `ZodError`. It does not send a response itself, so formatting is left to the app's error handler.

### Known gaps
- Mounted routers contribute only their `route` definitions to the app's doc. Their components and security schemes are dropped.
- A RouterPlus is detected only as the single handler passed to `use()` (`use(router)` or `use(path, router)`). In `use(path, mw, router)`, the router's routes still work but don't appear in the doc.
- Calling `generateOpenAPIDocument()` again re-registers the mounted routes into the app's base registry each time.
- The remaining lint warnings are deliberate: `generateOpenAPIDocument(): any` and `registerSecurityScheme(scheme: any)` are public types, and tightening them would break consumers' compilation, so leave them for a major version.

Tests use Vitest and supertest against a real Express app; they are all in `src/express-plus.test.ts`.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-facing change (public API, types, runtime behavior, dependencies consumers install) gets an entry under `## [Unreleased]` in the same PR, in the matching category (Added, Changed, Deprecated, Removed, Fixed, Security), with a PR link reference like `([#6])` plus a matching `[#6]: …/pull/6` link at the bottom. Skip internal-only changes (CI, dev tooling, tests, refactors with no visible effect). Call out anything that could break consumers.

Releases go through `npm version <patch|minor|major>`. `scripts/changelog.mjs` runs as `preversion` (refuses to release with an empty `[Unreleased]`) and `version` (moves the entries under `## [X.Y.Z] - date`, updates the compare links, and stages the file into npm's version commit). Don't move entries by hand.

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
