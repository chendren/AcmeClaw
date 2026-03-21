"""
AcmeClaw Property Intelligence Tools
Lookup lot size, building footprint, and property details from an address.

Data sources:
- OpenStreetMap Nominatim (geocoding - free)
- US Census TIGERweb (parcel boundaries - free)
- OpenStreetMap Overpass (building footprints - free)
- Google Maps Static API (satellite imagery - when key available)

Copyright 2026 Chad Hendren. All Rights Reserved.
"""

from strands import tool
import json
import urllib.request
import urllib.parse
import math


@tool
def property_lookup(address: str) -> str:
    """Look up property details for a street address including lot size, building footprint,
    and satellite imagery. Use this before generating a quote to get accurate lot measurements.

    Args:
        address: Full street address (e.g., '1234 Maple St, Omaha, NE 68102').
    """
    results = {}

    # Step 1: Geocode the address using OpenStreetMap Nominatim
    params = urllib.parse.urlencode({
        "q": address,
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
        "extratags": 1,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "AcmeClaw/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return f"Geocoding failed for '{address}': {e}"

    if not data:
        return f"Address not found: '{address}'. Please verify the address."

    location = data[0]
    lat = float(location["lat"])
    lon = float(location["lon"])
    display = location.get("display_name", address)
    osm_type = location.get("type", "unknown")
    osm_class = location.get("class", "unknown")

    results["address"] = display
    results["coordinates"] = {"lat": lat, "lon": lon}
    results["type"] = f"{osm_class}/{osm_type}"

    # Step 2: Query building footprints from OpenStreetMap Overpass API
    # Search within ~100m radius of the geocoded point
    overpass_query = f"""
    [out:json][timeout:10];
    (
      way["building"](around:50,{lat},{lon});
    );
    out body geom;
    """
    overpass_url = "https://overpass-api.de/api/interpreter"
    try:
        overpass_data = urllib.parse.urlencode({"data": overpass_query}).encode()
        overpass_req = urllib.request.Request(overpass_url, data=overpass_data,
            headers={"User-Agent": "AcmeClaw/1.0"})
        with urllib.request.urlopen(overpass_req, timeout=15) as resp:
            buildings = json.loads(resp.read())

        building_footprints = []
        total_building_sqft = 0
        for element in buildings.get("elements", []):
            if "geometry" in element:
                coords = [(p["lon"], p["lat"]) for p in element["geometry"]]
                area_sqm = polygon_area_sqm(coords)
                area_sqft = area_sqm * 10.764
                building_footprints.append({
                    "type": element.get("tags", {}).get("building", "yes"),
                    "area_sqft": round(area_sqft),
                })
                total_building_sqft += area_sqft

        results["buildings"] = building_footprints
        results["total_building_sqft"] = round(total_building_sqft)
    except Exception as e:
        results["buildings"] = []
        results["building_error"] = str(e)

    # Step 3: Estimate lot size from parcel data or fallback to typical sizes
    # Try to get parcel boundary from OSM
    parcel_query = f"""
    [out:json][timeout:10];
    (
      way["landuse"="residential"](around:50,{lat},{lon});
      relation["landuse"="residential"](around:50,{lat},{lon});
    );
    out body geom;
    """
    lot_sqft = None
    try:
        parcel_data = urllib.parse.urlencode({"data": parcel_query}).encode()
        parcel_req = urllib.request.Request(overpass_url, data=parcel_data,
            headers={"User-Agent": "AcmeClaw/1.0"})
        with urllib.request.urlopen(parcel_req, timeout=15) as resp:
            parcels = json.loads(resp.read())

        for element in parcels.get("elements", []):
            if "geometry" in element:
                coords = [(p["lon"], p["lat"]) for p in element["geometry"]]
                area_sqm = polygon_area_sqm(coords)
                lot_sqft = round(area_sqm * 10.764)
                results["lot_sqft"] = lot_sqft
                results["lot_source"] = "OpenStreetMap parcel data"
                break
    except:
        pass

    # Fallback: estimate from address type
    if not lot_sqft:
        # Use typical lot sizes for the area
        address_lower = address.lower()
        if any(w in address_lower for w in ["apt", "unit", "#", "suite"]):
            lot_sqft = 0
            results["lot_note"] = "Apartment/unit — no lawn service applicable"
        elif any(w in address_lower for w in ["acres", "acre", "farm", "rural"]):
            lot_sqft = 43560  # 1 acre default
        else:
            # Typical Omaha residential lot
            lot_sqft = 8500
        results["lot_sqft"] = lot_sqft
        results["lot_source"] = "Estimated (typical residential lot for area)"

    # Step 4: Calculate mowable area
    building_sqft = results.get("total_building_sqft", 0)
    driveway_estimate = lot_sqft * 0.08  # ~8% for driveway/walkways
    mowable_sqft = max(0, lot_sqft - building_sqft - driveway_estimate)

    results["mowable_sqft"] = round(mowable_sqft)
    results["driveway_estimate_sqft"] = round(driveway_estimate)

    # Step 5: Classify lot size for pricing
    if mowable_sqft < 5000:
        size_class = "small"
    elif mowable_sqft < 10000:
        size_class = "medium"
    elif mowable_sqft < 20000:
        size_class = "large"
    else:
        size_class = "xl"

    results["size_classification"] = size_class

    # Step 6: Generate satellite map URL (works without API key at low res)
    map_url = f"https://www.google.com/maps/@{lat},{lon},18z/data=!3m1!1e1"
    results["satellite_map_url"] = map_url

    # Format the report
    report = f"PROPERTY REPORT — {display}\n"
    report += f"{'='*50}\n\n"
    report += f"Coordinates: {lat:.6f}, {lon:.6f}\n"
    report += f"Lot Size: {lot_sqft:,} sq ft ({lot_sqft/43560:.2f} acres)\n"
    report += f"Source: {results.get('lot_source', 'estimated')}\n\n"

    if results.get("buildings"):
        report += f"Buildings on Property:\n"
        for b in results["buildings"]:
            report += f"  • {b['type']}: {b['area_sqft']:,} sq ft\n"
        report += f"  Total building footprint: {building_sqft:,} sq ft\n\n"

    report += f"Driveway/Hardscape (est): {round(driveway_estimate):,} sq ft\n"
    report += f"MOWABLE LAWN AREA: {round(mowable_sqft):,} sq ft\n"
    report += f"Size Classification: {size_class.upper()}\n\n"
    report += f"Satellite View: {map_url}\n"

    return report


@tool
def get_satellite_image(address: str) -> str:
    """Get a link to satellite/aerial imagery of a property for visual assessment.

    Args:
        address: Full street address.
    """
    params = urllib.parse.urlencode({
        "q": address,
        "format": "json",
        "limit": 1,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "AcmeClaw/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        if data:
            lat, lon = data[0]["lat"], data[0]["lon"]
            google_url = f"https://www.google.com/maps/@{lat},{lon},19z/data=!3m1!1e1"
            bing_url = f"https://www.bing.com/maps?cp={lat}~{lon}&lvl=19&style=a"
            return f"Satellite imagery for {address}:\n\nGoogle Maps: {google_url}\nBing Maps: {bing_url}\n\nUse these to visually assess: lawn condition, obstacles, slope, tree coverage, fence lines."
    except Exception as e:
        return f"Failed to get imagery: {e}"

    return f"Address not found: {address}"


@tool
def estimate_service_time(mowable_sqft: int, services: str) -> str:
    """Estimate how long a job will take based on lawn size and services requested.

    Args:
        mowable_sqft: Mowable lawn area in square feet.
        services: Comma-separated services (mow, edge, trim, etc.).
    """
    # Industry averages for a 2-person crew
    time_minutes = 0
    breakdown = []

    requested = [s.strip().lower() for s in services.split(",")]

    for svc in requested:
        if svc in ("mow", "mowing"):
            # ~1 acre/hour with commercial mower = ~730 sqft/min
            mins = max(15, mowable_sqft / 730)
            breakdown.append(f"Mowing: {mins:.0f} min")
            time_minutes += mins
        elif svc in ("edge", "edging"):
            # Perimeter-based: ~200 linear ft / 5 min
            perimeter = 4 * math.sqrt(mowable_sqft)  # rough square estimate
            mins = max(10, perimeter / 200 * 5)
            breakdown.append(f"Edging: {mins:.0f} min")
            time_minutes += mins
        elif svc in ("trim", "trimming"):
            mins = max(10, mowable_sqft / 2000 * 10)
            breakdown.append(f"Trimming: {mins:.0f} min")
            time_minutes += mins
        elif svc in ("leaf", "leaf_removal", "leaves"):
            mins = max(30, mowable_sqft / 500 * 10)
            breakdown.append(f"Leaf Removal: {mins:.0f} min")
            time_minutes += mins
        elif svc in ("aeration", "aerate"):
            mins = max(20, mowable_sqft / 1000 * 10)
            breakdown.append(f"Aeration: {mins:.0f} min")
            time_minutes += mins

    # Add 10 min for setup/teardown
    time_minutes += 10
    breakdown.append("Setup/teardown: 10 min")

    hours = time_minutes / 60
    report = f"SERVICE TIME ESTIMATE ({mowable_sqft:,} sq ft lawn)\n"
    report += f"{'='*40}\n"
    for line in breakdown:
        report += f"  {line}\n"
    report += f"\n  TOTAL: {time_minutes:.0f} minutes ({hours:.1f} hours)\n"
    report += f"  Crew: 2 persons\n"

    return report


def polygon_area_sqm(coords):
    """Calculate area of a polygon given (lon, lat) coordinates using the Shoelace formula
    with a simple equirectangular projection."""
    if len(coords) < 3:
        return 0

    # Convert to meters using equirectangular projection
    ref_lat = coords[0][1]
    cos_lat = math.cos(math.radians(ref_lat))

    points = []
    for lon, lat in coords:
        x = (lon - coords[0][0]) * cos_lat * 111320  # meters
        y = (lat - coords[0][1]) * 111320  # meters
        points.append((x, y))

    # Shoelace formula
    n = len(points)
    area = 0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]

    return abs(area) / 2
