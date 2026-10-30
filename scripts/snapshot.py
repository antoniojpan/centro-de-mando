#!/usr/bin/env python3
"""Genera data/dashboard.json a partir de la hoja 'Longevidad Gamificada'.

Reutiliza el fetch autenticado del skill asesor-deportivo (API v4, con reserva CDP)
y traduce el CSV de la pestaña `registro` al JSON que consume la web.

Estructura de columnas (pestaña `registro`, 1-based):
    A  fecha (dd/mm/aaaa)         C  saldo total       K  peso      O  cintura
    X  Flexiones   Y Dominadas    Z  tirón horiz       AA Abdomin
    AB Sentadillas AC Aerob       AD VO2max            AE total del día
    AF..AL  saldo acumulado por tipo (mismo orden)

Uso:
    python3 scripts/snapshot.py [--out data/dashboard.json] [--dias 60]
"""
import csv
import json
import os
import subprocess
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FETCH = os.path.expanduser(
    '~/Dropbox/MIMUNDOp/.opencode/skills/asesor-deportivo/scripts/fetch.py')

TIPOS = ['Flexiones', 'Dominadas', 'tirón horiz', 'Abdomin',
         'Sentadillas', 'Aerob', 'VO2max']

# indices 0-based en el CSV
IDX_FECHA, IDX_SALDO, IDX_PESO, IDX_CINTURA = 0, 2, 10, 14
IDX_RECUENTO = list(range(23, 30))   # X..AD
IDX_TOTAL_DIA = 30                   # AE
IDX_SALDO_TIPO = list(range(31, 38)) # AF..AL


def num(txt):
    """'1,75' -> 1.75 ; '' -> None ; no numérico -> None."""
    if txt is None:
        return None
    txt = str(txt).strip().replace('\u00a0', '')
    if not txt:
        return None
    try:
        return float(txt.replace('.', '').replace(',', '.'))
    except ValueError:
        return None


def fecha(txt):
    """'30/10/2026' -> '2026-10-30'."""
    try:
        return datetime.strptime(txt.strip(), '%d/%m/%Y').strftime('%Y-%m-%d')
    except (ValueError, AttributeError):
        return None


def leer_csv(path):
    with open(path, encoding='utf-8') as f:
        return list(csv.reader(f))


def main():
    out = os.path.join(RAIZ, 'data', 'dashboard.json')
    dias = 60
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    if '--dias' in sys.argv:
        dias = int(sys.argv[sys.argv.index('--dias') + 1])

    if os.path.exists(FETCH):
        subprocess.run([sys.executable, FETCH], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    filas = leer_csv('/tmp/entrenos.csv')

    # las filas 1-2 son cabecera; los datos empiezan en la 3 y van de hoy hacia atrás
    datos = []
    for f in filas[2:]:
        d = fecha(f[IDX_FECHA]) if len(f) > IDX_FECHA else None
        if not d:
            continue
        datos.append({
            'fecha': d,
            'saldo_total': num(f[IDX_SALDO]) if len(f) > IDX_SALDO else None,
            'peso': num(f[IDX_PESO]) if len(f) > IDX_PESO else None,
            'cintura': num(f[IDX_CINTURA]) if len(f) > IDX_CINTURA else None,
            'total_dia': num(f[IDX_TOTAL_DIA]) if len(f) > IDX_TOTAL_DIA else None,
            'recuento': [num(f[i]) if len(f) > i else None for i in IDX_RECUENTO],
            'saldo_tipo': [num(f[i]) if len(f) > i else None for i in IDX_SALDO_TIPO],
        })

    if not datos:
        sys.exit('No hay filas con fecha en /tmp/entrenos.csv')

    ultimo = datos[0]
    tipos = []
    for i, nombre in enumerate(TIPOS):
        tipos.append({
            'nombre': nombre,
            'saldo': ultimo['saldo_tipo'][i],
            'hoy': ultimo['recuento'][i],
        })

    historia = [{'fecha': x['fecha'], 'saldo': x['saldo_total']}
                for x in datos[:dias] if x['saldo_total'] is not None]

    salida = {
        'generado': datetime.now().astimezone().isoformat(timespec='seconds'),
        'fuente': 'Longevidad Gamificada — pestaña registro',
        'ultima_fecha': ultimo['fecha'],
        'saldo_total': ultimo['saldo_total'],
        'total_hoy': ultimo['total_dia'],
        'tipos': tipos,
        'historia': historia,
    }

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)
    print(f'{out}: {len(historia)} días, último {ultimo["fecha"]}')


if __name__ == '__main__':
    main()
