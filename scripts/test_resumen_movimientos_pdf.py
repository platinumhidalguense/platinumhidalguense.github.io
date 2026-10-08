"""Verifica los PDF ficticios generados por el test del resumen semanal."""
from pathlib import Path
from pypdf import PdfReader

base = Path(__file__).resolve().parent.parent / 'tmp/pdfs/resumen_movimientos_incidencias'
for name in ['global_incidencias.pdf', 'solo_incidencias.pdf']:
    pdf = PdfReader(base / name)
    texts = [page.extract_text() for page in pdf.pages]
    for i, (page, text) in enumerate(zip(pdf.pages, texts)):
        assert abs(float(page.mediabox.width) - 612) < 1
        assert abs(float(page.mediabox.height) - 792) < 1
        assert 'Comercializadora PLATINUM Hidalguense' in text, (name, i, 'membrete incompleto')
        assert 'OBRA DE PRUEBA' in text, (name, i, 'obra ausente')
        assert 'SEMANA 28' in text, (name, i, 'semana ausente')
        if name == 'solo_incidencias.pdf' or i > 0:
            assert 'INCIDENCIAS APLICADAS' in text and 'DESCUENTO' in text, (name, i)
    if name == 'global_incidencias.pdf':
        combined = '\n'.join(texts)
        for number in range(30, 64):
            assert combined.count('TRABAJADOR ' + str(number) + '\n') == 1, number
        assert 'PRUEBA TRABAJADOR dos' in combined, 'primer registro perdido'
    print(f'OK {name}: {len(pdf.pages)} página(s), carta vertical y encabezados completos.')
