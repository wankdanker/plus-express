# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The package now includes the MIT `LICENSE` file. ([#21])

## [3.0.0] - 2026-10-28

**Breaking changes:**

- On validation failures, `err.errors` is now an array of Zod issues instead of a JSON string.
- On Express 5, `req.query` now holds the validated values (for example the number `5` instead of the string `"5"` for a `z.coerce.number()` field), matching Express 4 and `req.parsed.query`.
- The compiled output requires Node.js 16.11 or later.

Details are in the entries below.

### Added

- `AnyZodObject` type, used as the bound for object-schema generics. It accepts strict, loose and catchall object schemas. ([#6])
- `MountInfo` type is now exported. ([#6])
- Releases are published from GitHub Actions with npm provenance, so each version on npm can be traced to the commit and workflow that built it. ([#8])

### Changed

- Upgraded `@asteasolutions/zod-to-openapi` to ^9.1.0 and `zod` to ^4.6.7. ([#6])
- Compiled output now targets ES2022 (previously ES2019), which requires Node.js 16.11 or later. ([#6])

### Removed

- `tsx` is no longer a runtime dependency. It was only used by the demo script. ([#6])

### Fixed

- Routes on routers nested inside other routers (for example `usersRouter.use('/admin', adminRouter)`) now appear in the app's OpenAPI document. This includes routers nested after their parent was mounted. ([#5])
- Validation errors now set `err.errors` to the array of Zod issues, as documented. Since the Zod 4 upgrade it had been a JSON string. If you `JSON.parse`d it, read the array directly instead. The original `ZodError` is now attached as `err.cause`. ([#6])
- Path parameters are now always marked `required: true` in the OpenAPI document, as the spec requires. Coerced schemas such as `z.coerce.number()` were documented as optional. ([#7])
- On Express 5, validated query values are now written back onto `req.query`, as on Express 4. Express 5 re-parses `req.query` on every access, so coerced values and defaults were lost there; only `req.parsed.query` had them. ([#7])
- `ExpressPlusApplication` and `RouterPlus` can be used where Express expects a request handler, so `http.createServer(app)` and supertest's `request(app)` now type-check. ([#6])

## [2.1.1] - 2025-11-19

### Fixed

- `use()` on enhanced apps and routers now accepts error-handling middleware (`(err, req, res, next)`) without type errors.

## [2.1.0] - 2025-11-18

### Added

- README sections on error handling, helper functions, TypeScript support, and troubleshooting.
- `repository`, `bugs` and `homepage` metadata in `package.json`.

## [2.0.2] - 2025-11-18

### Fixed

- `plus()` overloads now correctly infer `ExpressPlusReturn` for Express apps and `RouterPlusReturn` for routers. Previously this could fail with errors like "Property 'app' does not exist on type 'RouterPlusReturn'".

## [2.0.1] - 2025-11-18

No changes; the published package is identical to 2.0.0.

## [2.0.0] - 2025-11-18

### Added

- Unified `plus()` function. `plus(app)` enhances an Express application, `plus(router)` enhances an existing router, and `plus()` creates a new enhanced router.
- `plusRouter` as an alias of `routerPlus`.

## [1.0.0] - 2025-11-18

Initial release.

### Added

- Route methods (`get`, `post`, `put`, `delete`, `patch`, `options`, `head`) accept an options object with Zod schemas for `body`, `params`, `query` and `headers`. Requests are validated, and parsed values are available on `req.parsed`.
- OpenAPI 3.0 document generation from route definitions via `@asteasolutions/zod-to-openapi`.
- Enhanced routers whose routes appear in the app's OpenAPI document under their mount path.
- Chainable registry configuration: `setInfo`, `addServer`, `setDefaultQuerySchema`, `setDefaultHeaderSchema`, `setDefaultResponses`, and `registerSecurityScheme`.
- Supports Zod 4 and Express 4 or 5.

[Unreleased]: https://github.com/wankdanker/plus-express/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/wankdanker/plus-express/compare/v2.1.1...v3.0.0
[2.1.1]: https://github.com/wankdanker/plus-express/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/wankdanker/plus-express/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/wankdanker/plus-express/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/wankdanker/plus-express/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/wankdanker/plus-express/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/wankdanker/plus-express/tree/v1.0.0
[#5]: https://github.com/wankdanker/plus-express/pull/5
[#6]: https://github.com/wankdanker/plus-express/pull/6
[#7]: https://github.com/wankdanker/plus-express/pull/7
[#8]: https://github.com/wankdanker/plus-express/pull/8
[#21]: https://github.com/wankdanker/plus-express/pull/21
