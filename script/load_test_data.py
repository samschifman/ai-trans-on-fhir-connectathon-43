#!/usr/bin/env python3
"""Load the AI Transparency Connectathon FHIR transaction bundles.

The infrastructure bundle is loaded before patient bundles because the labeled
data references its Devices, prompt DocumentReferences, and verifier
Practitioner.  The loader is intentionally standard-library-only so it can be
used on a laptop without installing project dependencies.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
INFRASTRUCTURE = ROOT / "test_data" / "infrastructure" / "infrastructure_bundle.json"
DATASETS = {
    "unlabeled": ROOT / "test_data" / "unlabeled",
    "labeled": ROOT / "test_data" / "labeled",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="FHIR server base URL")
    parser.add_argument("--basic-auth", metavar="USER:PASS", help="HTTP Basic credentials")
    parser.add_argument("--bearer", metavar="TOKEN", help="Bearer token")
    parser.add_argument(
        "--only",
        choices=("labeled", "unlabeled", "infrastructure"),
        help="load only one dataset; infrastructure is also loaded for patient datasets",
    )
    parser.add_argument("--dry-run", action="store_true", help="list bundles without posting them")
    args = parser.parse_args()
    if args.basic_auth and args.bearer:
        parser.error("--basic-auth and --bearer are mutually exclusive")
    if args.basic_auth and ":" not in args.basic_auth:
        parser.error("--basic-auth must have the form USER:PASS")
    return args


def bundle_paths(only: str | None) -> list[Path]:
    paths: list[Path] = []
    if only in (None, "infrastructure", "labeled", "unlabeled"):
        paths.append(INFRASTRUCTURE)
    if only in (None, "labeled", "unlabeled"):
        paths.extend(sorted(DATASETS[only].glob("*_bundle.json")) if only else [])
    if only is None:
        paths.extend(sorted(DATASETS["unlabeled"].glob("*_bundle.json")))
        paths.extend(sorted(DATASETS["labeled"].glob("*_bundle.json")))
    return paths


def request_headers(args: argparse.Namespace) -> dict[str, str]:
    headers = {
        "Accept": "application/fhir+json",
        "Content-Type": "application/fhir+json",
    }
    if args.basic_auth:
        encoded = base64.b64encode(args.basic_auth.encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {encoded}"
    elif args.bearer:
        headers["Authorization"] = f"Bearer {args.bearer}"
    return headers


def post_bundle(url: str, path: Path, headers: dict[str, str]) -> tuple[int, str]:
    payload = path.read_bytes()
    request = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(request) as response:
            response.read()
            return response.status, "ok"
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace").strip().replace("\n", " ")
        detail = f"HTTP {error.code}"
        if body:
            detail += f": {body[:240]}"
        return error.code, detail
    except URLError as error:
        return 0, f"connection error: {error.reason}"
    except OSError as error:
        return 0, f"I/O error: {error}"


def load(args: argparse.Namespace) -> int:
    base_url = args.base_url.rstrip("/")
    headers = request_headers(args)
    paths = bundle_paths(args.only)
    if not paths:
        print("No transaction bundles found.", file=sys.stderr)
        return 1

    succeeded = 0
    failed = 0
    for path in paths:
        relative = path.relative_to(ROOT)
        if args.dry_run:
            print(f"DRY-RUN {relative}")
            succeeded += 1
            continue
        status, detail = post_bundle(base_url, path, headers)
        if 200 <= status < 300:
            print(f"OK      {relative} -> HTTP {status}")
            succeeded += 1
        else:
            print(f"FAILED  {relative} -> {detail}")
            failed += 1

    mode = " (dry run)" if args.dry_run else ""
    print(f"Summary{mode}: {succeeded} succeeded, {failed} failed, {len(paths)} total")
    return 1 if failed else 0


def main() -> int:
    return load(parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
