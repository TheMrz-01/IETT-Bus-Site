# AGENTS.md

This file is the operating guide for coding agents working in this repository.
It reflects the current project state (Bun + TypeScript + static frontend).

## Project Snapshot

- Runtime/tooling: Bun
- Language mode: TypeScript (`strict: true`)
- Frontend: plain HTML/CSS + browser-side TypeScript
- Backend entrypoint: `backend/server.ts` (currently empty)
- Frontend entrypoint: `frontend/script.ts`
- Package manager: Bun (`bun.lock` present)

## Required Rule Sources

Cursor rules were found and should be followed:

- `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`

Copilot rules were **not** found:

- `.github/copilot-instructions.md` does not exist

## Commands (Current, Verified From Repo)

Run all commands from repo root: `/Users/mirza/Desktop/IETT-Bus-Site`.

### Install

- `bun install`

### Development

- `bun run dev`
  - Runs the `dev` script from `package.json`
  - Current script value: `bun run backend/server.ts`

### Build

There is currently no official `build` script in `package.json`.

If you need a one-off Bun build, use explicit input files, for example:

- `bun build frontend/script.ts --outdir ./dist`

Only add/modify build commands if requested by the user.

### Lint / Type Check

There is currently no configured ESLint/Biome/Prettier command.

Use TypeScript checks as the baseline quality gate:

- `bunx tsc --noEmit`

If a lint tool is added later, prefer a script in `package.json` and run it via `bun run <script>`.

### Test

There are currently no tests committed.

When tests are added, use Bun test runner:

- All tests: `bun test`
- Single file: `bun test path/to/file.test.ts`
- Name filter (single test): `bun test --test-name-pattern "partial test name"`
- File + name filter: `bun test path/to/file.test.ts --test-name-pattern "exact or partial name"`

## Single-Test Guidance (Important)

When a user asks to run "just one test", prefer this order:

1. By file path if they gave a specific file.
2. By `--test-name-pattern` if they gave test name text.
3. By combining file path + name pattern to avoid over-running tests.

Example:

- `bun test tests/bus-api.test.ts --test-name-pattern "returns 404 for unknown line"`

## Code Style and Conventions

Follow existing repository style first; if missing, use the defaults below.

### General

- Keep changes minimal and scoped to the task.
- Avoid introducing new frameworks without explicit request.
- Prefer Bun-native APIs for server/runtime work.
- Do not commit secrets or `.env` contents.

### Imports

- Use ESM imports/exports (project uses `"type": "module"`).
- Keep imports at top of file.
- Group order:
  1) platform/runtime imports,
  2) third-party imports,
  3) local imports.
- Keep specifiers stable and explicit; avoid deep relative chains when aliases exist (none currently configured).

### TypeScript

- Target strict type safety (`tsconfig.json` has `strict: true`).
- Add explicit types at module boundaries (function params/returns for exported or shared functions).
- Prefer `unknown` over `any`; narrow before use.
- Use union types and type guards instead of type assertions when practical.
- Respect `noUncheckedIndexedAccess` by handling possibly undefined index results.
- Avoid non-null assertions (`!`) unless unavoidable and justified.

### Naming

- Variables/functions: `camelCase`.
- Types/interfaces/classes: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE` only for true constants; otherwise `camelCase`.
- DOM element refs should be descriptive (`busCodeInput`, `departureTimeBtn`, etc.).

### Formatting

- Match the file's existing formatting and quote style.
- Keep lines reasonably readable; avoid very long chained expressions when a temporary improves clarity.
- Prefer small, focused functions over large monolithic blocks.
- Avoid adding comments unless logic is non-obvious.

### HTML/CSS

- Keep semantic HTML where possible.
- Reuse existing class names unless refactor is requested.
- Prefer responsive units already in use (`clamp`, `%`, `vw`) for visual consistency.
- Keep CSS selectors simple and local; avoid over-specific selectors.

### Error Handling

- Fail fast on invalid input and return early.
- Wrap async network operations in `try/catch`.
- Provide user-safe error messages in UI; avoid exposing internal stack traces.
- In backend code, return clear HTTP status + JSON error payloads.
- Log actionable details for developers when appropriate.

### API / Data Handling

- Validate external data before assuming shape.
- Encode user input used in URLs (`encodeURIComponent` pattern is already present).
- Check `response.ok` before consuming JSON for fetch calls.
- Handle empty/null payloads gracefully in UI rendering.

## Agent Workflow Expectations

- Read relevant files before editing.
- Prefer `apply_patch` for small, targeted edits.
- Run the narrowest useful verification command after changes.
- If no test suite exists, at least run type-check when TypeScript changes are made.
- Do not create commits unless explicitly requested by the user.

## Practical Verification Matrix

- Frontend TS/UI edit: run `bunx tsc --noEmit`
- Backend/runtime edit: run `bun run dev` (or relevant targeted command)
- Test edit/addition: run affected test file first, then broader `bun test` if needed

## Known Gaps (As Of This Snapshot)

- No committed lint configuration
- No committed test files
- No committed build script
- `backend/server.ts` is empty and likely pending implementation

Agents should not invent missing infrastructure unless the user asks for it.
