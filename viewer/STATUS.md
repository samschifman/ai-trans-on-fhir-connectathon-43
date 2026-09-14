# FHIR Viewer Development Status

This file is the implementation record for the plan in
`working/plans/viewer_dev_plan.md`. It remains intentionally uncommitted for
human review.

## Phase checklist

- [x] Phase 0 — read references, loader, test-data load, HAPI spot checks
- [x] Phase 1 — project scaffold
- [x] Phase 2 — settings, FHIR client, pure FHIR modules
- [x] Phase 3 — AI pure modules
- [x] Phase 4 — patient page
- [x] Phase 5 — Scenario 2 filter page
- [x] Phase 6 — Scenario 3 and 4 recall pages
- [x] Phase 7 — query page, proxy, graph
- [x] Phase 8 — authentication, hardening, documentation

## Success criteria

- [x] 1. App starts and metadata reports FHIR R4
- [x] 2. Patient search, attribution table, drill-down, and unlabeled patients — live Bunny/Lacey checks pass; browser walkthrough remains manual
- [x] 3. Scenario 2 counts and loadable downloads — live count/collection checks pass with 106 labeled resources
- [x] 4. Device recall counts, patient counts, and disjoint target sets — live checks pass: 40/34/32 and 7/7/6
- [x] 5. Input recall counts and prompt-2 patient span — live checks pass: 29/19/24/10/24 and 13 patients for prompt-2
- [x] 6. Complete query log with copy-as-curl — unit/build checks pass; browser walkthrough remains manual
- [x] 7. Basic/Bearer auth and proxy mode — client coverage and 204 proxy preflight pass; browser walkthrough remains manual
- [x] 8. Permissive license check and participant README

## Evidence and notes

### Phase 0

- Required prompt, plan, resources list, IG examples, test-data README,
  infrastructure bundle, and Bunny bundle read on 2026-09-14.
- Loader created at `script/load_test_data.py`; test-data README instructions
  are complete.
- Loader `--help` and dry-run checks pass; test-data README instructions are complete.
- Docker was unavailable, so the HAPI verification used the installed Podman
  runtime with `hapiproject/hapi:latest`.
- HAPI metadata reports FHIR R4. The loader posted all 23 bundles successfully.
- Spot checks matched the documented Provenance counts: devices 40 / 34 / 32
  and prompt-2 19 records. The Bunny patient flow loaded 36 resources and 5
  AI Provenance records through the same loader used by the patient page.

### Implementation checks

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes: 20 tests in 8 active files; the opt-in live file contributes 12 skipped tests without `VIEWER_LIVE_BASE_URL`.
- `npm run build` passes.
- `npm run licenses` passes with the documented permissive allowlist.
- `awk 'length > 160' src/**/*.ts*` prints no lines.
- `rg 'dagre|notifications' src package.json` prints no lines; the unused
  dependencies and notifications stylesheet import are removed.
- HAPI metadata, loader POSTs, and the full live suite are verified through
  Podman: 23 bundles loaded and 32/32 tests pass with
  `VIEWER_LIVE_BASE_URL=http://localhost:8080/fhir npm test`.
- The proxy preflight returns HTTP 204 with echoed
  `Access-Control-Allow-Headers: x-fhir-base`.

## Review fixes

- A1: Ran `npm run format` first. Formatting-only files were `proxy/server.mjs`,
  `src/ai/{devices,filter,inputs,labels,patient,provenance,recall}.ts`,
  `src/App.tsx`, `src/components/{AiBadge,DetailPanel,DownloadButton,JsonView,ProvenanceCard,RecallResults,ResourceTable}.tsx`,
  `src/config/{settings,SettingsContext}.ts`, `src/fhir/{bundle,capability,client,FhirClientContext,references,search}.ts`,
  `src/main.tsx`, `src/pages/{DevicesPage,FilterPage,InputsPage,PatientPage,QueryPage,SettingsPage}.tsx`,
  `src/pages/patient/{PatientGraph,PatientSearch}.tsx`, `src/styles.css`, and the
  existing test/config files. Restructuring was limited to
  `PatientPage.tsx`, `QueryPage.tsx`, `ProvenanceCard.tsx`, `DetailPanel.tsx`,
  and `JsonView.tsx`. Prettier, lint, typecheck, tests, line-length check,
  build, and licenses pass.
- A2: Removed `dagre`, `@types/dagre`, `@mantine/notifications`, and the
  unused stylesheet import. Build and license checks pass.
- A3: Replaced dynamic reference imports in Devices and Inputs with static
  imports; the build no longer reports those dynamic-import warnings.
- A4: Simplified the FhirError import, clarified the inline-label walker,
  delayed download URL revocation by one second, and removed the smoke test.
- B1: Reference parsing now handles capitalized base paths, query strings, and
  `_history` references; unit coverage includes all six planned forms.
- B2: Resource tables use the full AiBadge text, verified state, tooltip, and
  a 120px minimum AI-label column.
- B3: Capability summaries treat unadvertised features as `not advertised`,
  recognize HAPI's `everything` spelling and include declarations, and explain
  that fallback behavior remains active. HAPI-shaped unit coverage passes.
- B4: Prompt decoding separates description/text/binary notes, removes
  duplicate descriptions, adds one-line previews, and provides explicit Show
  prompt toggles in Inputs and Provenance details. Infrastructure prompt tests
  confirm one `System Prompt` occurrence each.
- C1: URL `ref` parameters now auto-run device/input recall once under
  StrictMode. C2 clears progress in `finally` and removes the placeholder.
- C3 adds an optional Patient column to recall results only when patient data
  exists. C4 adds blank-patient safeguards, count loading, and a null-aware
  Total row.
- C5 aggregates non-AI informational warnings to one per download path. C6
  uses `securityToken`, including blank-system tokens, with unit coverage.
- C7 adds OPTIONS preflight handling and request-header echoing; README now
  documents a different-origin proxy.
- Security review: no hard-coded credentials or key files were found. Request
  logs now redact Authorization, API-key, token, secret, password, cookie, and
  credential headers; proxy diagnostics omit query strings. Settings remain in
  browser localStorage by design, and FHIR response bodies remain in the
  in-memory query log because resource inspection is an intentional feature.
- D0 corrected README discovery claims to match current profile/type/manual
  discovery. The optional Provenance-cache discovery extension was deferred;
  the README makes no claim that it exists.
- E1 added `test/live.test.ts`; all 12 live tests pass against the loaded HAPI
  data, including the documented totals and disjoint target sets.
- E2: No Chromium/Chrome/Playwright/browser tool is installed in this
  environment. The following eight checks are not browser-verified and need
  human confirmation with the app running at the indicated local URL:
  1. `http://localhost:5173/`: Test connection shows R4/HAPI and no
     orange FALSE badges.
  2. `http://localhost:5173/patient`: Bunny Table badges are fully legible;
     MedicationRequest details show device, verifier, one prompt preview, and
     a working Show prompt toggle.
  3. `http://localhost:5173/devices?ref=Device%2Fai-device-3`: results load
     automatically with 32 Provenances and no stale progress text.
  4. `http://localhost:5173/devices`: device 1 shows 40 Provenances/7 patients
     and recall results include a Patient column.
  5. `http://localhost:5173/inputs`: prompt-2 shows 19 Provenances/13 patients
     and rows show two-line previews.
  6. `http://localhost:5173/filter`: server-wide counts have a Total row;
     blank One patient ID disables Count and both downloads.
  7. `http://localhost:5173/query`: search, Details, and copy-as-curl show the
     correct request.
  8. `http://localhost:5175`: proxy mode produces `/proxy/` URLs in the log.

## Deviations and blockers

The implementation does not depend on Docker or Podman at runtime.

### Final commands

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run licenses
python3 script/load_test_data.py --base-url http://localhost:8080/fhir --dry-run
VIEWER_LIVE_BASE_URL=http://localhost:8080/fhir npm test
curl -i -X OPTIONS -H 'Access-Control-Request-Headers: x-fhir-base' http://localhost:5175/proxy/metadata
```

All commands pass. The dry-run loader command reports 23 bundles and does not
contact a server.
