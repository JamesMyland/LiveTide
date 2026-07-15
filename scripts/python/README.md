# Data scripts (Python)

Local scripts that fetch dive data into `data/` so LiveTide can load it
same-origin (no browser CORS). Standard-library only, except where noted.

| Script | Output | Notes |
| --- | --- | --- |
| `fetch_data.py` | `data/divesites.json`, `data/uk/*.geojson` | divemap.gr catalogue (optional `DIVEMAP_TOKEN`) + divemap.uk public GeoJSON layers. |
| `fetch_ukho_wrecks.py` | `data/uk-wrecks.geojson` | Authoritative UKHO/ADMIRALTY wrecks (Open Government Licence v3). Needs `pip install pyshp`. Use `--bbox` to clip. |

```bash
# divemap.gr catalogue (token optional; reads are public)
DIVEMAP_TOKEN=xxxx python scripts/python/fetch_data.py

# UKHO wrecks -> GeoJSON (clip to UK & Ireland to keep it small)
pip install pyshp
python scripts/python/fetch_ukho_wrecks.py --bbox -11,49,2,61
```

Third-party data — check each source's licence and add attribution before
publishing. These scripts only read public endpoints; they do not bypass any
login, CSRF, or bot-protection.
