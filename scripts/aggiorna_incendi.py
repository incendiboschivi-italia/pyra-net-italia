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
import math
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


# I "falsi positivi" più comuni causati da calore industriale (non incendi boschivi):
# raffinerie, acciaierie e poli petrolchimici che i satelliti scambiano spesso per
# focolai a causa delle torce di gas, degli altiforni e dei camini ad alta temperatura.
# Per ciascuno: nome, latitudine, longitudine, raggio di esclusione in km.
ZONE_INDUSTRIALI_ESCLUSE = [
    ("Raffineria di Milazzo (ME)", 38.2031, 15.2678, 3.5),
    ("Acciaierie ex ILVA di Taranto", 40.4975, 17.2050, 7.0),
    ("Polo chimico di Ferrara", 44.8585, 11.5957, 3.0),
    ("Polo petrolchimico di Sarroch (CA)", 39.0720, 9.0220, 4.0),
    ("Polo petrolchimico di Porto Torres (SS)", 40.8330, 8.4150, 5.0),
    ("Raffineria di Falconara Marittima (AN)", 43.6386, 13.3804, 2.5),
]


def distanza_km(lat1, lon1, lat2, lon2):
    """Distanza approssimata in km tra due punti (formula haversine)."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def e_falso_positivo_industriale(lat, lon):
    for nome, zlat, zlon, raggio in ZONE_INDUSTRIALI_ESCLUSE:
        if distanza_km(lat, lon, zlat, zlon) <= raggio:
            return True
    return False


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

    # esclude i falsi positivi noti (calore industriale, non incendi boschivi)
    prima_del_filtro = len(dentro_italia)
    dentro_italia = [
        r for r in dentro_italia
        if not e_falso_positivo_industriale(r["lat"], r["lon"])
    ]
    esclusi_industriali = prima_del_filtro - len(dentro_italia)

    # Raggruppa per POSIZIONE (griglia di circa 1 km), non più per orario esatto:
    # lo stesso incendio, se rilevato più volte da satelliti/passaggi diversi,
    # va contato una volta sola. Di ogni gruppo si tiene il rilevamento più
    # intenso (FRP più alto) e più recente, così il numero mostrato sul sito
    # rappresenta punti fisici distinti, non singoli passaggi satellitari.
    gruppi = {}
    for r in dentro_italia:
        # ~0.01° equivale a circa 0.7-1.1 km alle latitudini italiane: punti
        # entro questa distanza vengono considerati lo stesso incendio.
        cella = (round(r["lat"], 2), round(r["lon"], 2))
        attuale = gruppi.get(cella)
        if attuale is None:
            gruppi[cella] = r
        else:
            frp_nuovo = r["frp"] if r["frp"] is not None else -1
            frp_attuale = attuale["frp"] if attuale["frp"] is not None else -1
            # tiene il rilevamento con FRP più alto; a parità, il più recente
            if frp_nuovo > frp_attuale or (
                frp_nuovo == frp_attuale and (r["data_ora"] or "") > (attuale["data_ora"] or "")
            ):
                gruppi[cella] = r

    unici_tutti = list(gruppi.values())

    # Mostra solo i rilevamenti con intensità (FRP) di almeno 50 MW: scarta
    # i focolai deboli, tiene solo quelli seri/confermati.
    SOGLIA_FRP_MINIMA = 50
    unici = [r for r in unici_tutti if r["frp"] is not None and r["frp"] >= SOGLIA_FRP_MINIMA]

    output = {
        "aggiornato_il": datetime.now(timezone.utc).isoformat(),
        "fonte": f"NASA FIRMS (VIIRS/MODIS, NRT) — filtrato sui confini reali dell'Italia, esclusi i falsi positivi industriali noti, raggruppato per posizione, solo FRP >= {SOGLIA_FRP_MINIMA} MW",
        "rilevamenti": unici,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/incendi-attivi.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Trovati {len(tutti)} rilevamenti totali nell'area, {len(dentro_italia)} dentro l'Italia, "
          f"raggruppati in {len(unici_tutti)} punti distinti, {len(unici)} con FRP >= {SOGLIA_FRP_MINIMA} MW "
          f"({esclusi_industriali} esclusi come falsi positivi industriali).")


if __name__ == "__main__":
    main()
