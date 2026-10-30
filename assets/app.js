/* Centro de Mando — capa de datos + render.
 *
 * Hoy lee un snapshot estático (data/dashboard.json) que genera
 * scripts/snapshot.py desde la hoja. Cuando exista el endpoint de Apps Script,
 * solo hay que cambiar `cargar()` por un fetch a la API: el resto no se toca.
 */

const FUENTE = 'data/dashboard.json';

/* ---------- utilidades ---------- */

const fmt = (n, dec = 1) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : n.toFixed(dec).replace('.', ',');

const signo = (n) => (n > 0 ? '+' : '');

const clase = (n) => (n === null || n === undefined ? '' : n >= 0 ? 'ok' : n > -3 ? 'warn' : 'bad');

const fechaCorta = (iso) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/* ---------- carga ---------- */

async function cargar() {
  const r = await fetch(FUENTE, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo leer ${FUENTE} (${r.status})`);
  return r.json();
}

/* ---------- render: cabecera ---------- */

function pintarCabecera(d) {
  document.getElementById('fecha-datos').textContent = `Datos al ${fechaCorta(d.ultima_fecha)}`;
  document.getElementById('kpi-saldo').textContent = signo(d.saldo_total) + fmt(d.saldo_total);
  document.getElementById('kpi-saldo').style.color =
    d.saldo_total >= 0 ? 'var(--ok)' : 'var(--bad)';
  document.getElementById('kpi-hoy').textContent = fmt(d.total_hoy, 2);
}

/* ---------- render: tarjetas por tipo ---------- */

function pintarTipos(d) {
  const cont = document.getElementById('tipos');
  cont.innerHTML = d.tipos
    .map((t) => {
      const s = t.saldo ?? 0;
      return `<div class="tipo ${clase(s)}">
        <div class="nombre">${t.nombre}</div>
        <div class="saldo">${signo(s)}${fmt(s)}</div>
        <div class="hoy">hoy ${fmt(t.hoy, 2)} ud</div>
      </div>`;
    })
    .join('');
}

/* ---------- render: barras de saldo por tipo ---------- */

function pintarBarras(d) {
  const W = 660, fila = 34, padIzq = 110, padDer = 60;
  const H = d.tipos.length * fila + 10;
  const vals = d.tipos.map((t) => t.saldo ?? 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const rango = max - min || 1;
  const ancho = W - padIzq - padDer;
  const x0 = padIzq + (Math.abs(min) / rango) * ancho;

  const barras = d.tipos
    .map((t, i) => {
      const v = t.saldo ?? 0;
      const y = i * fila + 6;
      const w = (Math.abs(v) / rango) * ancho;
      const x = v >= 0 ? x0 : x0 - w;
      const color = v >= 0 ? 'var(--ok)' : v > -3 ? 'var(--warn)' : 'var(--bad)';
      return `
        <text x="${padIzq - 10}" y="${y + 15}" text-anchor="end">${t.nombre}</text>
        <rect x="${x}" y="${y}" width="${Math.max(w, 1.5)}" height="20" rx="5"
              fill="${color}" opacity="${v >= 0 ? 0.85 : 0.7}"></rect>
        <text class="val" x="${v >= 0 ? x + w + 8 : x - 8}" y="${y + 15}"
              text-anchor="${v >= 0 ? 'start' : 'end'}">${signo(v)}${fmt(v)}</text>`;
    })
    .join('');

  document.getElementById('barras').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo por tipo de ejercicio">
      <line x1="${x0}" y1="0" x2="${x0}" y2="${H}" stroke="var(--border)" stroke-width="1"></line>
      ${barras}
    </svg>`;
}

/* ---------- render: línea del saldo total ---------- */

function pintarLinea(d) {
  const datos = [...d.historia].reverse(); // antiguo -> reciente
  if (datos.length < 2) {
    document.getElementById('linea').innerHTML = '<p class="msg">Aún no hay histórico suficiente.</p>';
    return;
  }

  const W = 900, H = 260, mL = 46, mR = 14, mT = 12, mB = 26;
  const vals = datos.map((x) => x.saldo);
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals, 0);
  const rango = hi - lo || 1;
  const x = (i) => mL + (i / (datos.length - 1)) * (W - mL - mR);
  const y = (v) => mT + (1 - (v - lo) / rango) * (H - mT - mB);

  const pts = datos.map((p, i) => `${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
  const area = `${x(0)},${y(lo)} ${pts} ${x(datos.length - 1)},${y(lo)}`;

  // rejilla horizontal (4 líneas)
  const rejilla = Array.from({ length: 5 }, (_, k) => {
    const v = lo + (rango * k) / 4;
    const yy = y(v);
    return `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}"
                  stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"></line>
            <text x="${mL - 8}" y="${yy + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }).join('');

  const cero = y(0);
  const ejes = `<line x1="${mL}" y1="${cero}" x2="${W - mR}" y2="${cero}"
                      stroke="var(--muted)" stroke-width="1.2" opacity="0.8"></line>`;

  // etiquetas de fecha: primera, central y última
  const marcas = [0, Math.floor((datos.length - 1) / 2), datos.length - 1]
    .map(
      (i) =>
        `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fechaCorta(datos[i].fecha)}</text>`
    )
    .join('');

  const ultimo = datos[datos.length - 1];
  const punto = `<circle cx="${x(datos.length - 1)}" cy="${y(ultimo.saldo)}" r="4"
                         fill="var(--accent)"></circle>`;

  document.getElementById('linea').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del saldo total">
      ${rejilla}
      <polygon points="${area}" fill="var(--accent)" opacity="0.10"></polygon>
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.2"
                stroke-linejoin="round" stroke-linecap="round"></polyline>
      ${ejes}
      ${punto}
      ${marcas}
    </svg>`;
}

/* ---------- arranque ---------- */

(async function main() {
  try {
    const d = await cargar();
    pintarCabecera(d);
    pintarTipos(d);
    pintarBarras(d);
    pintarLinea(d);
    document.getElementById('generado').textContent =
      `Snapshot: ${d.generado.replace('T', ' ').slice(0, 16)} · fuente: ${d.fuente}`;
  } catch (e) {
    document.getElementById('tipos').innerHTML =
      `<p class="msg err">Error: ${e.message}</p>`;
  }
})();
