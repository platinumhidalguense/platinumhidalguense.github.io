#!/usr/bin/env python3
"""Lector independiente del respaldo integral (RESPALDO_INTEGRAL_V1).

Abre las partes .xlsx con openpyxl (no usa el código JavaScript que las escribió) y las compara
contra el JSON de fuentes del mismo corte: conteos, claves, relaciones por ID, importes al centavo,
textos sensibles a ceros (formato @), nulo/vacío/cero, textos largos recompuestos, hojas divididas,
nombres de hoja, paneles inmovilizados, autofiltro y ausencia de fórmulas.

Uso: python3 -I scripts/verificar_respaldo_xlsx.py --fuentes fuentes.json parte1.xlsx [parte2.xlsx ...]
Salida: JSON con {ok, archivos, hojas, filas, errores, huerfanas, urls_saneadas}; código 1 si hay errores.
"""
import hashlib
import json
import re
import sys
import zipfile

try:
    import openpyxl
except ImportError:  # pragma: no cover
    print(json.dumps({"ok": False, "errores": ["openpyxl no instalado"]}))
    sys.exit(2)

NULO = "∅ NULL"
MARCA = "∅"
TEXTO_TIPOS = {"ID", "TEXTO", "FECHA", "FECHA_HORA", "JSON", "LISTA"}
FIRMA = re.compile(r"[?&](token|signature|x-amz-signature|x-amz-credential|sig|se)=", re.I)
INVALIDOS = re.compile(r"[\\/?*\[\]:]")

errores = []


def error(msg):
    if len(errores) < 200:
        errores.append(msg)


def leer_tabla(ws):
    """Devuelve (encabezados, filas[celdas]) de una hoja en modo lectura."""
    filas = list(ws.iter_rows())
    if not filas:
        return [], []
    enc = [c.value for c in filas[0]]
    while enc and enc[-1] is None:
        enc.pop()
    return enc, [r[: len(enc)] for r in filas[1:]]


def valores(ws):
    enc, filas = leer_tabla(ws)
    return enc, [[c.value for c in r] + [None] * (len(enc) - len(r)) for r in filas]


def main(argv):
    if "--fuentes" not in argv:
        print(__doc__)
        return 2
    i = argv.index("--fuentes")
    fuentes_path = argv[i + 1]
    archivos = [a for k, a in enumerate(argv) if k not in (i, i + 1)]
    with open(fuentes_path, encoding="utf8") as fh:
        esperado = json.load(fh)
    fuentes = esperado["fuentes"]

    libros, manifiestos = [], []
    for a in archivos:
        wb = openpyxl.load_workbook(a, read_only=True, data_only=False)
        libros.append(wb)
        enc, filas = valores(wb["MANIFIESTO"])
        manifiestos.append([dict(zip(enc, f)) for f in filas])
        # Nombres de hoja, paneles y autofiltro directamente del XML.
        nombres = wb.sheetnames
        if len({n.lower() for n in nombres}) != len(nombres):
            error(a + ": nombres de hoja repetidos")
        for n in nombres:
            if len(n) > 31 or INVALIDOS.search(n) or n.startswith("'") or n.endswith("'"):
                error(a + ": nombre de hoja inválido " + n)
        with zipfile.ZipFile(a) as z:
            for nom in z.namelist():
                if re.match(r"xl/worksheets/sheet\d+\.xml$", nom):
                    xml = z.read(nom).decode("utf8")
                    if 'state="frozen"' not in xml or "<autoFilter " not in xml:
                        error(a + ": " + nom + " sin encabezado inmovilizado o autofiltro")
                    if "<f>" in xml or "<f " in xml:
                        error(a + ": " + nom + " contiene fórmulas")

    gen = lambda m, k: next((x["VALOR"] for x in m if x["SECCION"] == "GENERAL" and x["CLAVE"] == k), None)
    ids = {gen(m, "id_respaldo") for m in manifiestos}
    if len(ids) != 1:
        error("las partes no pertenecen al mismo respaldo")
    if any(gen(m, "formato") != "RESPALDO_INTEGRAL_V1" for m in manifiestos):
        error("formato distinto de RESPALDO_INTEGRAL_V1")
    declarados = [x["CLAVE"] for x in manifiestos[0] if x["SECCION"] == "ARCHIVO"]
    if len(declarados) != len(archivos):
        error("el manifiesto declara %d archivos y se recibieron %d" % (len(declarados), len(archivos)))
    hojas_m = [x for x in manifiestos[0] if x["SECCION"] == "HOJA"]
    for m in manifiestos[1:]:
        if [x["CLAVE"] for x in m if x["SECCION"] == "HOJA"] != [x["CLAVE"] for x in hojas_m]:
            error("los manifiestos de las partes no coinciden")
    por_parte = {}
    for x in hojas_m:
        por_parte.setdefault(int(x["PARTE"]), []).append(x["CLAVE"])
    for k, wb in enumerate(libros, 1):
        faltan = [h for h in por_parte.get(k, []) if h not in wb.sheetnames]
        if faltan:
            error("parte %d sin hojas declaradas: %s" % (k, faltan[:5]))

    def hoja_de(nombre):
        for x in hojas_m:
            if x["CLAVE"] == nombre:
                return libros[int(x["PARTE"]) - 1][nombre]
        return None

    def logica(nombre_logico, fuente=None):
        partes = sorted([x for x in hojas_m if x["HOJA_LOGICA"] == nombre_logico and (fuente is None or x["FUENTE"] == fuente)],
                        key=lambda x: int(x["DESDE_FILA"] or 0))
        enc, celdas = None, []
        for x in partes:
            e, f = leer_tabla(hoja_de(x["CLAVE"]))
            if enc is not None and e != enc:
                error(nombre_logico + ": encabezados distintos entre partes")
            enc = e
            if len(f) != int(x["VALOR"]):
                error("%s: el manifiesto declara %s filas y la hoja tiene %d" % (x["CLAVE"], x["VALOR"], len(f)))
            celdas.extend(f)
        return enc or [], celdas

    # Diccionario y textos largos (pueden estar en cualquier parte).
    enc, filas = logica("DICCIONARIO")
    dic = {}
    for r in filas:
        d = dict(zip(enc, [c.value for c in r]))
        dic.setdefault(d["HOJA"], {})[d["CAMPO"]] = d
    enc, filas = logica("TEXTOS_LARGOS")
    largos = {}
    for r in filas:
        d = dict(zip(enc, [c.value for c in r]))
        largos.setdefault(d["ref"], []).append(d)
    texto_largo = {}
    for ref, partes in largos.items():
        partes.sort(key=lambda d: d["parte"])
        s = "".join(p["fragmento"] or "" for p in partes)
        if len(s) != partes[0]["longitud_total"] or [p["parte"] for p in partes] != list(range(1, partes[0]["partes"] + 1)):
            error("texto largo incompleto " + ref)
        if partes[0]["sha256"] and partes[0]["sha256"] != NULO and hashlib.sha256(s.encode("utf8")).hexdigest() != partes[0]["sha256"]:
            error("huella de texto largo distinta " + ref)
        texto_largo[ref] = s

    def dec(v):
        if v is None:
            return ""
        if isinstance(v, str):
            if v == NULO:
                return None
            if v.startswith(MARCA + " TEXTO_LARGO ref="):
                return texto_largo.get(v.split(" ")[2][4:], "∃FALTA")
            if v.startswith(MARCA + MARCA):
                return v[1:]
        return v

    urls = 0

    def igual(fuente_v, celda_v, tipo):
        nonlocal urls
        if fuente_v is None:
            return celda_v is None
        if tipo in ("JSON", "LISTA") or isinstance(fuente_v, (dict, list)):
            try:
                return json.loads(celda_v) == fuente_v
            except Exception:
                return False
        if isinstance(fuente_v, bool):
            return celda_v is fuente_v
        if isinstance(fuente_v, (int, float)):
            if isinstance(celda_v, str):
                return celda_v == str(fuente_v) or celda_v == repr(fuente_v)
            return isinstance(celda_v, (int, float)) and not isinstance(celda_v, bool) and abs(celda_v - fuente_v) <= 1e-9 * max(1, abs(fuente_v))
        if isinstance(fuente_v, str) and fuente_v != celda_v and FIRMA.search(fuente_v) and celda_v == fuente_v.split("?")[0] + " [firma temporal omitida]":
            urls += 1
            return True
        return fuente_v == celda_v

    claves_por_hoja, hojas_verificadas, filas_total, huerfanas = {}, 0, 0, {}
    datos_hoja = {}
    logicas = []
    for x in hojas_m:
        par = (x["HOJA_LOGICA"], x["FUENTE"])
        if par not in logicas:
            logicas.append(par)
    for nombre, fuente in logicas:
        if fuente not in fuentes:
            continue
        enc, celdas = logica(nombre, fuente)
        hojas_verificadas += 1
        meta = dic.get(nombre, {})
        tipos = {c: (meta.get(c) or {}).get("TIPO") for c in enc}
        derivadas = {c for c in enc if str((meta.get(c) or {}).get("ORIGEN") or "").startswith("DERIVADO")}
        omitidas = {c for c, d in meta.items() if d.get("TIPO") == "OMITIDO"}
        pk = [c for c in enc if (meta.get(c) or {}).get("CLAVE") == "PK"]
        filas = []
        for r in celdas:
            fila = {}
            for c, cel in zip(enc, list(r) + [None] * (len(enc) - len(r))):
                v = cel.value if cel is not None else None
                if cel is not None and getattr(cel, "data_type", None) == "f":
                    error(nombre + ": fórmula en " + c)
                if v is not None and tipos.get(c) in TEXTO_TIPOS and (cel.data_type != "s" or cel.number_format != "@"):
                    error("%s.%s: texto sin formato @ (%s/%s)" % (nombre, c, cel.data_type, cel.number_format))
                fila[c] = dec(v)
            filas.append(fila)
        filas_total += len(filas)
        datos_hoja[nombre] = filas
        if fuente == "config":
            esperadas = {r["clave"]: r for r in fuentes[fuente]}
            vistos = set()
            for f in filas:
                if f["clave"] not in esperadas or re.search(r"pwd|token|password|secret|clave_api|key", str(f["campo"]), re.I):
                    error("configuración no autorizada: %s.%s" % (f["clave"], f["campo"]))
                    continue
                vistos.add(f["clave"])
                v = esperadas[f["clave"]]["valor"]
                real = v if f["campo"] == "(arreglo)" else v.get(f["campo"])
                if json.loads(f["valor_json"]) != real:
                    error("configuración distinta: %s.%s" % (f["clave"], f["campo"]))
            if vistos != set(esperadas):
                error("configuración: claves %s vs %s" % (sorted(vistos), sorted(esperadas)))
            continue
        fuente_filas = fuentes[fuente]
        if len(filas) != len(fuente_filas):
            error("%s: %d filas en el libro y %d en la fuente" % (nombre, len(filas), len(fuente_filas)))
        clave = lambda d: "|".join(str(d.get(c)) for c in pk)
        libro_idx = {clave(f): f for f in filas}
        if len(libro_idx) != len(filas):
            error(nombre + ": claves repetidas")
        claves_por_hoja[nombre] = {str(f.get(pk[0])) for f in filas} if pk else set()
        for src in fuente_filas:
            f = libro_idx.get(clave(src))
            if f is None:
                error("%s: falta la fila %s" % (nombre, clave(src)))
                continue
            for c, v in src.items():
                if c not in enc:
                    if c not in omitidas:
                        error("%s: columna %s sin exportar ni declarar" % (nombre, c))
                    continue
                if not igual(v, f[c], tipos.get(c)):
                    error("%s[%s].%s: fuente=%r libro=%r" % (nombre, clave(src), c, str(v)[:60], str(f[c])[:60]))
            for c in enc:
                if c not in src and c not in derivadas and f[c] is not None:
                    error("%s.%s: valor sin fuente" % (nombre, c))
    # Relaciones por ID.
    for nombre, meta in dic.items():
        filas = datos_hoja.get(nombre)
        if not filas:
            continue
        for c, d in meta.items():
            rel = d.get("RELACION")
            if not rel or rel == NULO or "." not in str(rel):
                continue
            destino = str(rel).split(".")[0]
            if destino not in claves_por_hoja:
                continue
            k = sum(1 for f in filas if f.get(c) not in (None, "") and str(f.get(c)) not in claves_por_hoja[destino])
            if k:
                huerfanas[nombre + "." + c] = k
    # CONTROL: conteos y totales recalculados desde el libro y desde la fuente.
    enc, filas = logica("CONTROL")
    hoja_por_fuente = {f: n for n, f in logicas}
    for r in filas:
        d = dict(zip(enc, [c.value for c in r]))
        fu = d["FUENTE"]
        if fu not in fuentes or fu == "config" or d["DOMINIO"] == "CUADRE_TABLERO":
            continue
        libro_f = datos_hoja.get(hoja_por_fuente.get(fu), [])
        o = d["OBRA_ID"]
        sel_l = libro_f if o == "(TOTAL)" else [x for x in libro_f if x.get("obra_id") == ("" if o == NULO else o)]
        sel_s = fuentes[fu] if o == "(TOTAL)" else [x for x in fuentes[fu] if x.get("obra_id") == (None if o == NULO else o)]
        if d["FILAS_EXPORTADAS"] != len(sel_l) or len(sel_s) != len(sel_l):
            error("CONTROL %s/%s: filas %s, libro %d, fuente %d" % (fu, o, d["FILAS_EXPORTADAS"], len(sel_l), len(sel_s)))
        if d["COINCIDE"] == "NO":
            error("CONTROL %s/%s: no coincide con el servidor" % (fu, o))
        campo = d["CAMPO_IMPORTE"]
        if campo and campo != NULO:
            cent = lambda xs: sum(int(round(float(x.get(campo)) * 100 + (1e-9 if float(x.get(campo)) >= 0 else -1e-9))) for x in xs if isinstance(x.get(campo), (int, float)) and not isinstance(x.get(campo), bool))
            if str(cent(sel_l)) != d["TOTAL_CENTAVOS"] or cent(sel_s) != cent(sel_l):
                error("CONTROL %s/%s.%s: total %s, libro %d, fuente %d" % (fu, o, campo, d["TOTAL_CENTAVOS"], cent(sel_l), cent(sel_s)))
    # Movimientos laborales: cada reingreso documentado aparece con su propia fecha efectiva.
    mov = datos_hoja.get("MOVIMIENTOS_LABORALES")
    if mov is None and "MOVIMIENTOS_LABORALES" in [n for n, _ in logicas]:
        _, celdas = logica("MOVIMIENTOS_LABORALES")
    if "historial" in fuentes and any(n == "MOVIMIENTOS_LABORALES" for n, _ in logicas):
        enc, celdas = logica("MOVIMIENTOS_LABORALES")
        mov = [dict(zip(enc, [dec(c.value) for c in r])) for r in celdas]
        idx = {(m["historial_id"], m["tipo_evento"]): m for m in mov if m.get("historial_id")}
        for h in fuentes["historial"]:
            if h.get("accion") == "REACTIVACION":
                d = h.get("datos_despues") or {}
                m = idx.get((str(h["id"]), "REINGRESO"))
                esperado_f = (d.get("fecha_reingreso") or d.get("fecha_alta") or "")[:10] or None
                if not m or m["fecha_efectiva"] != esperado_f:
                    error("MOVIMIENTOS_LABORALES: reingreso %s sin evento o con otra fecha" % h["id"])
            if h.get("accion") == "ALTA" and (str(h["id"]), "ALTA") not in idx:
                error("MOVIMIENTOS_LABORALES: alta %s sin evento" % h["id"])
    # Hojas de compatibilidad V0: misma población del padrón por centro (sin papelera).
    if "trabajadores" in fuentes:
        for x in hojas_m:
            if x["FUENTE"] != "(compatibilidad V0)":
                continue
            enc, celdas = leer_tabla(hoja_de(x["CLAVE"]))
            ids_hoja = {str(r[enc.index("ID TRABAJADOR")].value) for r in celdas}
            obra = next((m["CLAVE"] for m in manifiestos[0] if m["SECCION"] == "CENTRO" and m["VALOR"] == x["HOJA_LOGICA"]), None)
            src = {w["id"] for w in fuentes["trabajadores"] if w["obra_id"] == obra and not w.get("eliminado")}
            if ids_hoja != src:
                error("hoja V0 %s: población distinta del padrón" % x["CLAVE"])
    resultado = {"ok": not errores, "archivos": len(archivos), "hojas": hojas_verificadas, "filas": filas_total,
                 "textos_largos": len(texto_largo), "urls_saneadas": urls, "huerfanas": huerfanas, "errores": errores}
    print(json.dumps(resultado, ensure_ascii=False))
    return 0 if not errores else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
