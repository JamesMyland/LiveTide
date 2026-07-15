#!/usr/bin/env python3
"""
Download the UKHO / ADMIRALTY "Wrecks and Obstructions" shapefile and convert it
to GeoJSON for LiveTide's wreck layer (data/uk-wrecks.geojson).

Authoritative, and free under the Open Government Licence v3:
  https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
Attribute the UK Hydrographic Office when publishing.

Usage:
  pip install pyshp
  python scripts/python/fetch_ukho_wrecks.py
  python scripts/python/fetch_ukho_wrecks.py --bbox -11,49,2,61   # clip to UK & Ireland (minLng,minLat,maxLng,maxLat)

The full global set is ~94k points; use --bbox to keep the GeoJSON small enough
for the browser to load and cluster comfortably.
"""
import argparse, io, json, os, sys, tempfile, urllib.request, zipfile

ITEM = "4dbf2ace22bf4f9785fb445d0593bc2c"
DATA_URL = f"https://datahub.admiralty.co.uk/portal/sharing/rest/content/items/{ITEM}/data"
OUT = os.path.join("data", "uk-wrecks.geojson")
UA = "LiveTide-data-fetch/1.0 (personal use)"


def jsonable(v):
    if v is None:
        return None
    return v if isinstance(v, (str, int, float, bool)) else str(v)


def rep_point(shape):
    """A representative lng/lat for a shape: the point itself, or the centroid
    of the vertices for lines/polygons."""
    pts = getattr(shape, "points", [])
    if not pts:
        return None
    if len(pts) == 1:
        return pts[0]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="minLng,minLat,maxLng,maxLat to clip the output (optional)")
    args = ap.parse_args()
    bbox = [float(x) for x in args.bbox.split(",")] if args.bbox else None

    try:
        import shapefile  # pyshp
    except ImportError:
        sys.exit("Missing dependency — run: pip install pyshp")

    print("Downloading UKHO wrecks shapefile (~25 MB)…")
    req = urllib.request.Request(DATA_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        blob = r.read()

    feats, kept, skipped = [], 0, 0
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        zipfile.ZipFile(io.BytesIO(blob)).extractall(td)
        shps = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(td)
                      for f in fs if f.lower().endswith(".shp"))
        if not shps:
            sys.exit("No .shp found inside the download.")
        for shp in shps:
            sf = shapefile.Reader(shp)
            field_names = [f[0] for f in sf.fields[1:]]  # skip the DeletionFlag field
            before = kept
            for sr in sf.iterShapeRecords():
                c = rep_point(sr.shape)
                if not c:
                    skipped += 1; continue
                lng, lat = c[0], c[1]
                if not (-180 <= lng <= 180 and -90 <= lat <= 90):
                    skipped += 1; continue   # not WGS84? see note below
                if bbox and not (bbox[0] <= lng <= bbox[2] and bbox[1] <= lat <= bbox[3]):
                    continue
                props = {}
                for k, v in zip(field_names, sr.record):
                    jv = jsonable(v)
                    if jv not in (None, ""):
                        props[k] = jv
                feats.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
                    "properties": props,
                })
                kept += 1
            sf.close()   # release file handles so the temp dir can be removed (Windows)
            print(f"  {os.path.basename(shp)}: +{kept - before}")

    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f)
    print(f"Wrote {OUT}: {kept} wrecks (skipped {skipped}).")
    if kept == 0:
        print("No points kept — the shapefile may use a projected CRS rather than WGS84;\n"
              "in that case reproject to EPSG:4326 (e.g. with pyproj) before converting.")


if __name__ == "__main__":
    main()
