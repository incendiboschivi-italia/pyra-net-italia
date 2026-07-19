#!/usr/bin/env python3
"""
Scarica i rilevamenti attivi di incendio da NASA FIRMS e tiene solo quelli che
cadono DAVVERO dentro i confini dell'Italia (non un semplice rettangolo).

Richiede la variabile d'ambiente FIRMS_MAP_KEY (chiave gratuita, vedi README).
Richiede il pacchetto "shapely" (installato dalla GitHub Action).
"""

import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

from shapely.geometry import shape, Point

MAP_KEY = os.environ.get("FIRMS_MAP_KEY")
if not MAP_KEY:
    print("Errore: variabile d'ambiente FIRMS_MAP_KEY non impostata.", file=sys.stderr)
    sys.exit(1)

# Rettangolo "largo" solo per limitare quanti dati scarichiamo da NASA (efficienza),
# il confine VERO dell'Italia viene applicato dopo con i confini reali (sotto).
AREA_LARGA = "6.0,35.0,19.0,47.5"
GIORNI = 1

SORGENTI = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"]
BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{area}/{giorni}"

# Confini reali dei paesi del mondo (Natural Earth, dominio pubblico), circa 800 KB.
CONFINI_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"

# I confini "110m" sono semplificati: aggiungiamo un piccolo margine (in gradi,
# circa 8 km) attorno alla vera forma dell'Italia per non perdere per errore
# rilevamenti vicino a coste e confini reali.
MARGINE_GRADI = 0.07


def carica_confine_italia():
    with urllib.request.urlopen(CONFINI_URL, timeout=60) as resp:
        dati = json.loads(resp.read().decode("utf-8"))

    for feature in dati["features"]:
        proprieta = feature.get("properties", {})
        nome = proprieta.get("ADMIN") or proprieta.get("NAME") or ""
        codice = proprieta.get("ISO_A3") or proprieta.get("ADM0_A3") or ""
        if nome == "Italy" or codice == "ITA":
            geometria = shape(feature["geometry"])
            return geometria.buffer(MARGINE_GRADI)

    raise RuntimeError("Confine dell'Italia non trovato nel file scaricato.")


def scarica_sorgente(source):
    url = BASE_URL.format(key=MAP_KEY, source=source, area=AREA_LARGA, giorni=GIORNI)
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
    print("Scarico i confini reali dell'Italia...")
    confine_italia = carica_confine_italia()

    tutti = []
    for sorgente in SORGENTI:
        tutti.extend(scarica_sorgente(sorgente))

    # tiene solo i punti che cadono davvero dentro l'Italia (+ piccolo margine)
    dentro_italia = [
        r for r in tutti
        if confine_italia.contains(Point(r["lon"], r["lat"]))
    ]

    # rimuove duplicati (stesso punto/ora arrotondato) tra sensori diversi
    visti = set()
    unici = []
    for r in dentro_italia:
        chiave = (round(r["lat"], 2), round(r["lon"], 2), r["data_ora"])
        if chiave not in visti:
            visti.add(chiave)
            unici.append(r)

    output = {
        "aggiornato_il": datetime.now(timezone.utc).isoformat(),
        "fonte": "NASA FIRMS (VIIRS/MODIS, NRT) — filtrato sui confini reali dell'Italia",
        "rilevamenti": unici,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/incendi-attivi.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Trovati {len(tutti)} rilevamenti totali nell'area, {len(unici)} dentro l'Italia.")


if __name__ == "__main__":
    main()
