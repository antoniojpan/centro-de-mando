# Centro de Mando

Panel web personal: estado del sistema de entrenamiento «Longevidad Gamificada».

**En línea:** https://antoniojpan.github.io/centro-de-mando/

## Qué muestra ahora

- **Saldo total** y **unidades de hoy** (pestaña `registro`, columnas C y AE).
- **Saldo por tipo de ejercicio** (columnas AF–AL): superávit o déficit acumulado
  de Flexiones, Dominadas, tirón horiz, Abdomin, Sentadillas, Aerob y VO2max.
- **Gráfica de barras** con esos saldos y **evolución del saldo total** de los
  últimos 60 días registrados.

## Cómo se actualizan los datos

La página es estática y lee `data/dashboard.json`. Ese archivo se regenera desde
la hoja con:

```bash
python3 scripts/snapshot.py          # escribe data/dashboard.json
git add data && git commit -m "datos" && git push
```

`snapshot.py` reutiliza el fetch autenticado del skill `asesor-deportivo`
(API v4 de Sheets; si el token está caducado cae a Chrome vía CDP, así que
necesita el perfil `~/.agent-browser/gsheet` abierto).

## Estructura

```
index.html            página
assets/styles.css     estilos
assets/app.js         capa de datos + render (SVG, sin dependencias)
data/dashboard.json   snapshot que consume la página
scripts/snapshot.py   hoja -> JSON
```

## Siguiente paso previsto

Sustituir el snapshot por un endpoint de Apps Script (lectura y escritura en
vivo). Solo hay que cambiar `cargar()` en `assets/app.js`: el resto del render
no se toca.

## Aviso

`data/dashboard.json` es público (GitHub Pages en repo público). Contiene solo
saldos agregados por tipo, sin notas de salud ni medidas corporales.
