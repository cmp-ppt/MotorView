#!/usr/bin/env python3
"""Convierte el listado Excel de motores en un SQL de carga inicial para Supabase.

Uso:
    pip install openpyxl
    python3 tools/build_seed_sql.py LISTADO.xlsx "Planta Magnetita" semilla.sql

Luego pega el contenido de semilla.sql en Supabase → SQL Editor → Run
(después de haber ejecutado supabase/esquema.sql).

El Excel y el SQL generado contienen el inventario real: NO los subas al
repositorio (están en .gitignore). Los datos viven solo en Supabase.

Estado y ubicación iniciales son INFERIDOS del TAG, la descripción, las
observaciones y la ruta de la hoja de vida; deben validarse con Mantenimiento.
"""
import datetime, re, sys
import openpyxl

if len(sys.argv) < 4:
    sys.exit(__doc__)
SRC, FAENA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

AREAS_TAG = {"200": "Viñita", "211": "Rougher", "212": "Finisher y Molinos", "213": "Flotación",
             "214": "Espesador Concentrado", "215": "Sentinas", "216": "Repulpeo", "221": "Bombas Geho"}
AREAS_PATH = {"Area 200 Viñita": "Viñita", "Area 211 Rougher": "Rougher", "Area 212 Finsher, Molinos": "Finisher y Molinos",
              "Area 213 Flotacion": "Flotación", "Area 214 Espesador concentrado": "Espesador Concentrado",
              "Area 215 Sentinas": "Sentinas", "Area 216 Repulpeo": "Repulpeo", "Area 221 Bbas.Geho": "Bombas Geho",
              "Area General": "General"}


def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    m = re.search(r"\d+(?:[.,]\d+)?", str(v))
    return float(m.group().replace(",", ".")) if m else None


def clean(v):
    if v is None: return None
    if isinstance(v, datetime.datetime): return v.strftime("%d/%m/%Y")
    s = re.sub(r"\s+", " ", str(v)).strip(" .")
    return s or None


def volt(v):
    s = clean(v)
    if s is None: return None, None
    n = num(s)
    if n == 3800: n = 380
    return n, s.replace("'", "")


def sql(v):
    if v is None: return "null"
    if isinstance(v, (int, float)): return repr(round(v, 4)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


ws = openpyxl.load_workbook(SRC, data_only=True).active
out = []
for r in ws.iter_rows(min_row=5, values_only=True):
    r = list(r[:16]) + [None] * (16 - len(r[:16]))
    if not any(v is not None for v in r): continue
    n, hp, kw, amp, vol, rpm, mont, frame, rl, rc, cos, _, tag, desc, obs, hoja = r
    tag_s, desc_s, obs_s = clean(tag), clean(desc), clean(obs)
    path = str(hoja or "")
    path_area = path.split("\\")[0] if "\\" in path else None
    blob = " ".join(x.upper() for x in (tag_s, desc_s, obs_s, path_area) if x)

    if "BAJA" in blob and ("DE BAJA" in blob or "DADO" in blob or "DADOS BAJA" in blob): estado = "De baja"
    elif "REPUESTO" in blob or "BODEGA" in blob: estado = "Repuesto"
    elif "TALLER" in blob: estado = "Taller"
    else: estado = "En servicio"

    digits = re.sub(r"\D", "", tag_s or "")[:3]
    area = AREAS_PATH.get(path_area) or AREAS_TAG.get(digits)
    if estado == "Repuesto": area = "Bodega de repuestos"
    elif estado == "De baja": area = "Dados de baja"
    elif estado == "Taller" and not area: area = "Taller"
    area = area or "Sin clasificar"

    tag_real = tag_s if tag_s and tag_s.upper() not in ("TALLER", "DE BAJA", "REPUESTO", "BODEGA", "ROUGHER", "MECANICOS") else None
    v_num, v_txt = volt(vol)
    mnt = clean(mont)
    mnt = mnt.lower() if mnt and mnt.lower() in ("horizontal", "vertical") else None
    kw_n, hp_n = num(kw), num(hp)
    if kw_n is None and hp_n: kw_n = round(hp_n * 0.746, 1)
    if hp_n is None and kw_n: hp_n = round(kw_n / 0.746)
    cos_n = num(cos)
    if cos_n is not None and not (0.5 <= cos_n <= 1): cos_n = None
    out.append((len(out) + 1, int(n) if isinstance(n, (int, float)) else None, FAENA, area, estado, tag_real, desc_s,
                (obs_s or "")[:500] or None, hp_n, kw_n, num(amp), v_num, v_txt, num(rpm), mnt, clean(frame),
                clean(rl), clean(rc), cos_n, clean(hoja)))

COLS = "id,numero,faena,area,estado,tag,descripcion,observaciones,hp,kw,amp,volt,volt_txt,rpm,montaje,frame,rod_libre,rod_carga,cos_fi,hoja_vida"
lines = ["-- Carga inicial de motores (generada por tools/build_seed_sql.py). NO subir al repositorio.",
         "-- Ejecutar DESPUÉS de supabase/esquema.sql. Se puede repetir: no pisa lo ya cargado.", "begin;"]
for i in range(0, len(out), 100):
    lote = ",\n".join("  (" + ",".join(sql(v) for v in row) + ")" for row in out[i:i + 100])
    lines.append(f"insert into public.motorview_motores ({COLS}) values\n{lote}\non conflict (id) do nothing;")
lines.append("commit;")
open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")

from collections import Counter
print(len(out), "motores →", OUT)
print(dict(Counter(r[4] for r in out)))
