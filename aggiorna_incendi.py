#!/usr/bin/env python3
"""
Scarica i rilevamenti attivi di incendio da NASA FIRMS per l'Italia
e li salva in data/incendi-attivi.json nel formato usato dal sito.

Richiede la variabile d'ambiente FIRMS_MAP_KEY (chiave gratuita, vedi README).
Pensato per essere eseguito dalla GitHub Action .github/workflows/aggiorna-incendi.yml
"""

import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

MAP_KEY = os.environ.get("FIRMS_MAP_KEY")
if not MAP_KEY:
    print("Errore: variabile d'ambiente FIRMS_MAP_KEY non impostata.", file=sys.stderr)
    sys.exit(1)

# Bounding box approssimativo dell'Italia (min_lon,min_lat,max_lon,max_lat)
AREA_ITALIA = "6.6,35.4,18.6,47.2"
GIORNI = 1  # ultimi N giorni (max 10 per l'endpoint /area)

# Più sensori = copertura migliore. VIIRS ha risoluzione più fine, MODIS storico più ampio.
SORGENTI = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"]

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{area}/{giorni}"


def scarica_sorgente(source):
    url = BASE_URL.format(key=MAP_KEY, source=source, area=AREA_ITALIA, giorni=GIORNI)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            testo = resp.read().decode("utf-8")
    except Exception as e:
        print(f"Avviso: impossibile scaricare {source}: {e}", file=sys.stderr)
        return []

    righe = []
    reader = csv.DictReader(io.StringIO(testo))
    for r in reader:
        try:
            lat = float(r["latitude"])
            lon = float(r["longitude"])
        except (KeyError, ValueError):
            continue

        data = r.get("acq_date", "")
        ora = r.get("acq_time", "0000").zfill(4)
        try:
            dt = datetime.strptime(f"{data} {ora}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
            data_ora = dt.isoformat()
        except ValueError:
            data_ora = None

        frp = None
        try:
            frp = round(float(r.get("frp", "")), 1)
        except ValueError:
            pass

        righe.append({
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "data_ora": data_ora,
            "frp": frp,
            "confidenza": r.get("confidence", "n/d"),
            "sensore": r.get("instrument", source.split("_")[0]),
        })
    return righe


def main():
    tutti = []
    for sorgente in SORGENTI:
        tutti.extend(scarica_sorgente(sorgente))

    # rimuove duplicati (stesso punto/ora arrotondato) tra sensori diversi
    visti = set()
    unici = []
    for r in tutti:
        chiave = (round(r["lat"], 2), round(r["lon"], 2), r["data_ora"])
        if chiave not in visti:
            visti.add(chiave)
            unici.append(r)

    output = {
        "aggiornato_il": datetime.now(timezone.utc).isoformat(),
        "fonte": "NASA FIRMS (VIIRS/MODIS, NRT)",
        "rilevamenti": unici,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/incendi-attivi.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Salvati {len(unici)} rilevamenti in data/incendi-attivi.json")


if __name__ == "__main__":
    main()
