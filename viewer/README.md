# FHIR Transparency Viewer

This is a read-only browser viewer for the AI Transparency on FHIR track at HL7
FHIR Connectathon 43. It connects to an arbitrary FHIR R4 server and makes the
track's four scenarios visible: attribution, AI/non-AI filtering, outputs by
model, and outputs by input.

## Launch

Requires Node 20 or newer.

```sh
cd viewer
npm install
npm run dev
```

Open the URL printed by Vite, then use Settings to enter the FHIR base URL. The
default is `http://localhost:8080/fhir`.

For the built application and proxy:

```sh
npm run build
npm run start
```

The built app and proxy are served at `http://localhost:5175`. During
development, proxy mode can be used by running `npm run proxy` in one terminal
and `npm run dev` in another; Vite forwards `/proxy` to port 5175.

## Settings

Settings are kept in browser `localStorage`. The panel supports no
authentication, HTTP Basic, Bearer tokens, arbitrary extra headers, direct or
proxy requests, page size, pagination cap, request timeout, resource types, and
the configurable AI label system/code. Presets can save server configurations.

Direct mode is the default and requires the target FHIR server to permit CORS.
Proxy mode sends the target base in `X-Fhir-Base`; the local Node proxy forwards
only GET requests and never hard-codes a server. Authorization is forwarded,
while the proxy log reports only whether an Authorization header was present.
The app can use a proxy on a different origin by setting Proxy origin in
Settings; the proxy supports the required CORS preflight.

## Four scenarios

### 1. Patient attribution

Patient searches support given/family starts-with searches, free-text name
search, ID reads, `_id`, and identifier fallbacks. The patient screen tries
`Patient/{id}/$everything` first, then configured resource searches using
`patient` and `subject` fallbacks. It hides Provenance rows and shows each
resource's label status, targeting Provenance count, author Device, verifier
status, and input references. Selecting a row shows the resource JSON and
resolved Device, Practitioner, prompt text, location, policy, and raw
Provenance records.

The graph tab is the default patient view. It keeps the Patient node at the
center, arranges related resources in surrounding rings, and supports zoom,
pan, and click-to-inspect. It contains the same non-Provenance resources and
direct resource references. Provenance-only resources such as Devices and
prompts remain in the detail view.

### 2. AI versus non-AI filtering

The AI Filter screen counts configured types either server-wide or for one
patient. Server-wide counts use `_summary=count`, `_total=accurate`, and then a
paginated fallback. The server-wide AI column uses the resource-level
`_security` search. Patient scope scans the loaded resources and recognizes
both resource-level and inline labels.

Downloads contain either a transaction Bundle with PUT entries (default) or a
collection Bundle. The AI bundle includes labeled resources, their Provenances,
and referenced Devices, prompts, verifiers, and Locations. The non-AI bundle
contains only resources without either label form and no Provenance.
For a server-wide AI download, discovery follows the server's `_security`
search and therefore has the same inline-only-label limitation as the
server-wide count; patient-scope downloads scan the loaded resources for both
forms.

### 3. Outputs by model

The Devices screen discovers AI Devices through the AI-Device profile search
and all-Device scanning filtered by the AI Device definition. A Device
reference can also be entered manually. Selecting a Device
runs:

```text
GET Provenance?agent=Device/{id}&_include=Provenance:target
```

It retries without `_include` when necessary, resolves targets, shows touched
versus server totals by type, distinct patients, verification status, and a
loadable results bundle.

### 4. Outputs by input

The Inputs screen searches AI prompt DocumentReferences by type and profile,
accepts a description search, and allows a reference to be entered directly.
Selecting one runs:

```text
GET Provenance?entity=DocumentReference/{id}&_include=Provenance:target
```

It uses the same output results layout as Devices. Prompt attachments are
base64-decoded for text and JSON content types. Contained prompts are shown
when their containing Provenance is inspected; they cannot be discovered by an
independent DocumentReference search.

## Query log and compatibility behavior

The Query screen includes a free-form search console and a complete request log.
Each entry records the URL, request headers with sensitive values redacted,
status, elapsed time, result count, response body, and copy-as-curl output using
the redacted headers captured when the request was made. Pagination follows
`Bundle.link[relation=next]` up to the configured cap, and the UI reports
partial results and warnings.

Reference resolution supports relative, absolute, contained, and `urn:uuid:`
references. Bundle `fullUrl` values seed a per-server session cache. Requests
have a configurable timeout and surface OperationOutcome or HTTP errors.
Connection settings, including credentials, are kept in browser localStorage;
use a trusted browser profile and clear settings when finished. Query responses
are intentionally retained in the in-memory log for inspection and can include
the FHIR server's sensitive data; use the log's Clear action when appropriate.

FHIR servers vary in support for `$everything`, `_include`, `_summary`,
`_total`, `_security`, and `_security:not`; the viewer displays warnings and
uses the documented fallback queries. Server-wide `_security` counts cannot
discover inline-only labels, so that limitation is shown in the AI Filter
screen. Client-side patient counts and downloads do recognize inline labels.

## Connectathon test-data loader

From the repository root:

```sh
python3 script/load_test_data.py --base-url http://localhost:8080/fhir
```

The standard-library-only loader posts infrastructure first, then all
unlabeled and labeled transaction bundles. Use `--only labeled`,
`--only unlabeled`, or `--only infrastructure`; patient-only modes still load
infrastructure first. Authentication options are `--basic-auth user:pass` and
`--bearer TOKEN`; `--dry-run` lists bundles without posting.

## Expected local test-data values

When loaded into the baseline HAPI server, the expected values are:

- 106 AI-labeled resources across the five labeled resource types.
- Devices: 40 / 34 / 32 Provenance records and 7 / 7 / 6 patients.
- Prompts: 29 / 19 / 24 / 10 / 24 Provenance records; prompt-2 spans 13 patients.
- The AI download contains 106 labeled resources, 106 Provenances, 3 Devices,
  5 prompt DocumentReferences, and the verifier Practitioner.

## License

The viewer is Apache-2.0. Runtime and build dependencies are checked with
`npm run licenses`; the current check passes with the allowlist of MIT,
Apache-2.0, BSD, ISC, 0BSD, CC0, CC-BY, BlueOak, Unlicense, and Python-2.0
licenses. No GPL/LGPL/AGPL/SSPL dependency is included.

The opt-in live integration checks can be run with
`VIEWER_LIVE_BASE_URL=http://localhost:8080/fhir npm test` from the `viewer`
directory after loading the test data.
