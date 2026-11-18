"""Lectura independiente V2. Sólo el XLSX ficticio de test_respaldo_integral.cjs.

No genera ni modifica libros. Abre con openpyxl y comprueba contenido y tipos reales.
Uso: python verificar_respaldo_trabajadores.py ruta/al/respaldo_ficticio.xlsx
"""
import json
import sys
import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=False)
checks = 0


def check(value, message):
    global checks
    assert value, message
    checks += 1


def records(name):
    sheet = wb[name]
    headers = [c.value for c in sheet[1]]
    check(len(headers) == len(set(headers)), f"Encabezados únicos {name}")
    return [dict(zip(headers, row)) for row in sheet.iter_rows(min_row=2, values_only=True)]


padron = records("Padrón completo")
check(len(padron) == 1007, "Padrón completo: 1007")
check(len({r["Referencia del trabajador"] for r in padron}) == 1007, "IDs únicos")
check({r["Razón social"] for r in padron} == {"PLATINUM", "JIRE"}, "Ambas razones sociales")
check(any(r["Estatus laboral"] == "BAJA" for r in padron), "Incluye bajas")
check(any(r["En papelera"] == "Sí" for r in padron), "Incluye papelera autorizada")
personales = records("Datos personales y contacto")
p = next(r for r in personales if r["Referencia del trabajador"].endswith("000000000101"))
check(p["Escolaridad"] == "SECUNDARIA", "Escolaridad")
check(p["Teléfono"] == "0012345678", "Teléfono exacto")
check(p["NSS"] == "00123456789", "NSS exacto")
bancos = records("Datos bancarios")
check(bancos[0]["Cuenta"] == "000012345678", "Cuenta exacta")
check(bancos[0]["CLABE"] == "001234567890123456", "CLABE exacta de 18 caracteres")
check(records("Domicilios")[0]["Código postal"] == "01000", "CP exacto")
movs = [r for r in records("Altas bajas y reingresos") if r["Referencia del trabajador"] == p["Referencia del trabajador"]]
check(len(movs) == 5, "Cinco movimientos originales")
check([r["Fecha efectiva registrada"] for r in movs] == ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"], "Fechas de ambos reingresos")
check(all(r["Ciclo registrado"] == "Sin dato" for r in movs), "Sin ciclos inventados")
check(len(records("Nóminas individuales")) == 1, "Una línea por concepto, sin duplicado del modelo")
for sheet in wb:
    check(sheet.max_row > 1, f"Sin hojas vacías {sheet.title}")
    check(sheet.freeze_panes == "A2", f"Encabezado inmovilizado {sheet.title}")
    check(bool(sheet.auto_filter.ref), f"Filtro {sheet.title}")
    for row in sheet:
        for cell in row:
            assert cell.data_type != "f", "No ejecutar fórmulas de notas importadas"
    if sheet.title in {"Datos bancarios", "Datos personales y contacto", "Domicilios"}:
        for cell in sheet[1]:
            if cell.value in {"NSS", "RFC", "CURP", "Cuenta", "CLABE", "Teléfono", "Código postal"}:
                for row in range(2, sheet.max_row + 1):
                    target = sheet.cell(row, cell.column)
                    assert target.data_type == "s" and target.number_format == "@", (sheet.title, cell.value)
                checks += 1
print(json.dumps({"ok": True, "lector": "openpyxl", "comprobaciones": checks, "trabajadores": len(padron), "hojas": len(wb.sheetnames)}, ensure_ascii=False))
