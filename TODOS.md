# TODOs

Items identified during spec review (2026-03-31). Each was reviewed interactively and approved for tracking.

## 1. CI/CD Pipeline

**What:** GitHub Actions workflow running `pnpm test` + `pnpm typecheck` + `pnpm lint` on push/PR.

**Why:** No CI exists. Tests only run when someone remembers locally. Without CI the new test suite has no enforcement and tests rot fast.

**Depends on:** Test infrastructure from spec review Phase 1 (Jest configs, Vitest config, mock factories).

## 2. Rule Evaluator Performance Benchmark

**What:** Jest test that evaluates 50+ rules with complex conditions and asserts completion under 100ms.

**Why:** `evaluator.ts:40` logs a warning at >100ms but nothing enforces the target. The evaluator runs on every form change in Meta/Google Ads — perf regression = bad UX.

**Depends on:** Rule evaluator unit tests (spec review Phase 3, item 14).

## 3. Database Query Timeout

**What:** Add `SET statement_timeout = '5s'` to `ComplianceDashboardService` raw SQL queries.

**Why:** `Promise.all()` on 3 heavy GROUP BY + JOIN queries with no timeout. A slow DB hangs the request indefinitely with no error for the user.

**Depends on:** Nothing — can be done independently.
