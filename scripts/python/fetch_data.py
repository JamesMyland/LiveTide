#!/usr/bin/env python3
"""
Fetch dive data sets locally and save them under data/ so LiveTide can load them
same-origin (no browser CORS). Re-run whenever you want fresh data.

Usage:
    python scripts/python/fetch_data.py                      # public reads
    DIVEMAP_TOKEN=your_token python scripts/python/fetch_data.py
    python scripts/python/fetch_data.py --token your_token

Sources:
  * divemap.gr REST API (open project; optional Bearer token) -> data/divesites.json
  * divemap.uk static GeoJSON layers                          -> data/uk/<name>.geojson

For authoritative UK wrecks, prefer fetch_ukho_wrecks.py (UKHO open data).

TERMS: these are third-party data sets. Reading public endpoints for personal /
local use is fine, but check each source's licence and add attribution before
redistributing or publishing the data. This script only reads public endpoints —
it does NOT bypass any login, CSRF, or bot-protection (and won't try to).
Requires Python 3.7+ (standard library only).
"""
import json, os, sys, time, urllib.request, urllib.error

DATA_DIR = "data"
UA = "LiveTide-data-fetch/1.0 (personal use)"


def get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)
    print(f"  saved {path}")


def get_token():
    if "--token" in sys.argv:
        return sys.argv[sys.argv.index("--token") + 1]
    return os.environ.get("DIVEMAP_TOKEN", "")


def fetch_divemap_gr():
    print("divemap.gr dive sites:")
    base = "https://divemap.gr/api/v1"
    tok = get_token()
    headers = {"Authorization": "Bearer " + tok} if tok else {}
    sites, page, total_pages = [], 1, 1
    while page <= total_pages:
        url = f"{base}/dive-sites/?page={page}&page_size=100"
        try:
            j = get(url, headers)
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} on page {page}; stopping"); break
        except Exception as e:
            print(f"  error: {e}; stopping"); break
        sites.extend(j.get("items", []))
        total_pages = j.get("total_pages", 1)
        print(f"  page {page}/{total_pages} ({len(sites)} sites)")
        page += 1
        time.sleep(0.2)
    if sites:
        save(os.path.join(DATA_DIR, "divesites.json"), sites)


UK_GEOJSON = ["wrecks", "unknown", "launch", "tide-station", "lighthouse", "sites"]


def fetch_divemap_uk():
    print("divemap.uk GeoJSON layers:")
    for name in UK_GEOJSON:
        url = f"https://divemap.uk/geojson/{name}.json"
        try:
            j = get(url)
        except urllib.error.HTTPError as e:
            print(f"  {name}: HTTP {e.code} (Cloudflare may block scripted access) — skipped"); continue
        except Exception as e:
            print(f"  {name}: error {e} — skipped"); continue
        save(os.path.join(DATA_DIR, "uk", f"{name}.geojson"), j)
        time.sleep(0.2)


if __name__ == "__main__":
    fetch_divemap_gr()
    fetch_divemap_uk()
    print("Done.")
