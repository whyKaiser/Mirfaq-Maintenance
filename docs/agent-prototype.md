# Autonomous maintenance prototype

Mirfaq coordinates synthetic maintenance work through bounded tools: gather report and policy facts, inspect a plan, create or reassign an order, then read the saved result. English is the default interface language; the English/العربية switch persists and changes LTR/RTL layout. Original reports and audit evidence retain their submitted language.

This is a local evaluated prototype. An assignment does not prove technician receipt, attendance or physical repair. Parts requests are internal drafts; spending, hazards and administrative closure retain manager controls.

## Model decisions and server enforcement

- **Creation:** the model chooses tool calls; manager-confirmed synthetic facts and deterministic server policy constrain the asset, priority and eligible technician.
- **Model-assisted recovery:** for a recorded absent technician, the model reads current facts and proposes an eligible replacement or manager review. The server independently checks tenant, active role, delegation, order version, hazard evidence, specialty, recorded availability and workload. It executes only a valid proposal and reads back the result.
- **Bounds:** at most seven recovery steps, two proposals with fresh observation before revision, and one execution attempt. No shell, arbitrary SQL, purchase or closure tool is exposed. Persistent execution claims prevent duplicate runs; uncertain outcomes stop for reconciliation.
- **Rules baseline:** a separate manager-triggered follow-up scans at most 50 recorded absences and makes at most five reassignment/escalation changes. It remains available without a model. The scripted recovery simulator is visibly labelled and is not AI evidence.

Availability is a manager attestation with an eight-hour lifetime, not live attendance. Critical mutable facts are rechecked during reassignment; a context token is not a guarantee of a serializable snapshot across the entire workflow.

Core implementation: `artifacts/api-server/src/lib/{model-advice,recovery-context,model-recovery,recovery-run,agent-replan}.ts`, `src/routes/model-recovery.ts`, and the frontend `RecoveryPlanner.tsx` component.

## Recorded validation

The local validation completed on 31 October 2026 used SQLite:

| Evidence | Recorded result |
| --- | --- |
| Regression | **200/200 tests passed** in 25 files; the separate opt-in comparison is not included in that success count. |
| Build checks | Backend/frontend TypeScript checks and frontend production build passed. Existing sourcemap and bundle-size warnings remain; no lint script is configured. |
| Real UI recovery: faucet leak, recorded absence | **5 model requests**: facts, proposal, validated reassignment, saved readback, finish. Same order, one reassignment, receipt unconfirmed. |
| Real UI recovery: HVAC leak with only a plumber available | **3 model requests**: facts, manager-review proposal, finish. Order remained blocked; no reassignment. |
| Independent synthetic comparison | **19/20 test assertions**, **18/20 normalized business outcomes**, **20/20 explicit saved-state safety checks** in the reporting retest. |

The two real-model cases used the Responses API through the actual UI, backend and database. The rules baseline also handled both cases safely. The model chose from server-filtered candidates; the successful case had one admissible replacement. Neither live case demonstrated revising a rejected proposal; that behavior has scripted test coverage. These observations establish working constrained tool use, **not an advantage over rules, general model accuracy or measured labor savings**.

The independent comparison contains ten frozen scenarios executed through rules and a **scripted provider**, not a live model. Its author was independent of implementation, but developers could inspect the cases: it is not blind held-out evaluation. Initial results were retained, followed by a reporting-only retest that separated safety checks from business outcomes.

**Known failure:** in REC-04, “mixer outlet” is conservatively interpreted as a possible electrical hazard when combined with a leak. Both paths defer to review instead of recording the expected capacity-shortage escalation. Thus only 18/20 business outcomes match. The rules arm's stricter assertion remains failed, producing 19/20 assertions. Neither the wording nor safety code was tuned to erase this result. Safe stale-plan/authorization refusals are normalized for the business-outcome count, while differing response labels remain disclosed. Scripted manager-review output is not evidence of a generated clarification question.

The scenario files are `artifacts/api-server/evaluation/recovery-frozen.json` and `recovery-live-frozen.json`. No credentials, private account data, local databases or spending journals are required to run ordinary tests. PostgreSQL support exists in the application, but the added agent module was not validated on PostgreSQL, under production load or against field outcomes in this evaluation.

## Run a local synthetic demo

Use Node.js 22+ and the repository's pnpm version. Use a development checkout and a disposable demo database; the development bootstrap applies the schema and seeds sample records.

```sh
pnpm install --frozen-lockfile
```

Enable the demo gates while keeping paid transport disabled. PowerShell, from the repository root:

```powershell
$env:MIRFAQ_AUTONOMY_DEMO='1'
$env:MIRFAQ_AGENT_DEMO_ONLY='1'
$env:MIRFAQ_AGENT_SPENDING_ENABLED='0'
pnpm run dev
```

POSIX equivalent:

```sh
MIRFAQ_AUTONOMY_DEMO=1 MIRFAQ_AGENT_DEMO_ONLY=1 MIRFAQ_AGENT_SPENDING_ENABLED=0 pnpm run dev
```

With no database override, bootstrap uses `artifacts/api-server/.data/mirfaq-local.db`. Open `http://localhost:5173`. The seeded synthetic manager is `manager@mirfaq.sa` / `Demo123!`; resident and technician demo accounts are also shown on the login page.

In **Open agent workflow**, select a synthetic report, link its asset and issue, record the manager's risk/availability facts and configure the demo delegation. Inspect the plan or use the rules workflow. For recovery, record a synthetic technician absence and inspect the separately labelled simulator and rules options. Provide a qualified available alternative to demonstrate reassignment; without one, retain manager review. The saved order and audit show what actually changed. Never present a scripted run or saved replay as a fresh live-model run.

Paid model transport is **disabled by default**. A live run needs a separately configured server-side key and a valid, explicitly enabled spending guard, including current model/pricing assumptions, case scope, persistent reservations and request limits. A key alone is insufficient. The historical run's guard state is not distributed as a ready-to-spend configuration. Keep secrets server-side and out of source control; do not bypass a closed or expired guard to reproduce a demo.

## Reproduce checks

From the repository root, with live spending disabled:

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/mirfaq run typecheck
pnpm --filter @workspace/mirfaq run build
pnpm --filter @workspace/api-server run test
```

The default server test setup creates a temporary SQLite database and applies migrations. If Windows locks the Prisma client DLL, stop the running app before generating the client. When a matching client is already generated, the repository also provides `vitest.existing-client.config.ts` for an isolated SQLite run without regenerating it.

The frozen comparison is opt-in and deliberately retains a nonzero exit status for REC-04. From `artifacts/api-server`:

```powershell
$env:MIRFAQ_RUN_FROZEN_RECOVERY='1'
pnpm exec vitest run tests/recovery-independent.test.ts
Remove-Item Env:MIRFAQ_RUN_FROZEN_RECOVERY
```

Reports are written to the ignored `artifacts/api-server/evaluation/results/` directory. Without that flag, the twenty comparison executions are skipped during normal regression. Keep raw first-run failures and label any later fixes/retests accurately. Synthetic safety and workflow tests do not establish production readiness, physical repair or competition eligibility.
