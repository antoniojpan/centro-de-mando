/**
 * Centro de Mando — publicador automático de datos.
 *
 * Corre DENTRO de la hoja «Longevidad Gamificada» (Extensiones → Apps Script),
 * así que lee el spreadsheet sin autenticación y empuja `data/dashboard.json`
 * al repo de GitHub. Un disparador horario lo mantiene al día sin depender de
 * ningún ordenador ni de ninguna sesión de agente.
 *
 * Instalación: ver apps-script/README.md
 */

// ---------------------------------------------------------------- configuración

const REPO = 'antoniojpan/centro-de-mando';
const ARCHIVO = 'data/dashboard.json';
const RAMA = 'main';
const HOJA = 'registro';
const DIAS_HISTORIA = 60;

// Fila 2 de la hoja: cabeceras reales (la 1 son metas calculadas).
const FILA_DATOS = 3;
const COL = {
  fecha: 1,        // A
  saldoTotal: 3,   // C
  peso: 11,        // K
  cintura: 15,     // O
  recuento: [24, 25, 26, 27, 28, 29, 30],  // X..AD
  totalDia: 31,                            // AE
  saldoTipo: [32, 33, 34, 35, 36, 37, 38], // AF..AL
};
const NOMBRES_FILA = 2; // W2..AD2 -> nombres de los tipos

// ------------------------------------------------------------------- utilidades

function numero_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v).trim().replace(/\u00a0/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function isoFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ------------------------------------------------------------------ construcción

function construirPayload_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  if (!sh) throw new Error(`No existe la pestaña «${HOJA}»`);

  const nombres = sh.getRange(NOMBRES_FILA, COL.recuento[0], 1, COL.recuento.length)
                    .getValues()[0];

  const filas = sh.getRange(FILA_DATOS, 1, DIAS_HISTORIA, COL.saldoTipo[COL.saldoTipo.length - 1])
                   .getValues();

  const datos = [];
  for (const f of filas) {
    const fecha = isoFecha_(f[COL.fecha - 1]);
    if (!fecha) continue;
    datos.push({
      fecha,
      saldo_total: numero_(f[COL.saldoTotal - 1]),
      peso: numero_(f[COL.peso - 1]),
      cintura: numero_(f[COL.cintura - 1]),
      total_dia: numero_(f[COL.totalDia - 1]),
      recuento: COL.recuento.map((c) => numero_(f[c - 1])),
      saldo_tipo: COL.saldoTipo.map((c) => numero_(f[c - 1])),
    });
  }
  if (!datos.length) throw new Error('No hay filas con fecha válida en la hoja');

  // Las filas van de la más reciente a la más antigua (fila 3 = hoy).
  const ultimo = datos[0];

  return {
    generado: new Date().toISOString().replace(/\.\d+Z$/, '+00:00'),
    fuente: 'Longevidad Gamificada — pestaña registro',
    ultima_fecha: ultimo.fecha,
    saldo_total: ultimo.saldo_total,
    total_hoy: ultimo.total_dia,
    tipos: nombres.map((nombre, i) => ({
      nombre: String(nombre || ''),
      saldo: ultimo.saldo_tipo[i],
      hoy: ultimo.recuento[i],
    })),
    historia: datos
      .filter((d) => d.saldo_total !== null)
      .map((d) => ({ fecha: d.fecha, saldo: d.saldo_total })),
  };
}

// --------------------------------------------------------------------- GitHub

function publicarEnGitHub_(json) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta la propiedad de script GITHUB_TOKEN');

  const api = `https://api.github.com/repos/${REPO}/contents/${ARCHIVO}`;
  const cabeceras = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  // ¿Existe ya? Necesitamos su sha para actualizarlo.
  const actual = UrlFetchApp.fetch(`${api}?ref=${RAMA}`, {
    headers: cabeceras,
    muteHttpExceptions: true,
  });

  let sha = null;
  if (actual.getResponseCode() === 200) {
    const cuerpo = JSON.parse(actual.getContentText());
    sha = cuerpo.sha;
    const previo = Utilities.newBlob(
      Utilities.base64Decode(cuerpo.content), 'application/json'
    ).getDataAsString();
    if (previo.trim() === json.trim()) {
      return 'sin cambios';
    }
  }

  const payload = {
    message: 'datos: actualización automática',
    content: Utilities.base64Encode(json, Utilities.Charset.UTF_8),
    branch: RAMA,
  };
  if (sha) payload.sha = sha;

  const r = UrlFetchApp.fetch(api, {
    method: 'put',
    headers: cabeceras,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = r.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`GitHub ${code}: ${r.getContentText().slice(0, 300)}`);
  }
  return 'publicado';
}

// ------------------------------------------------------------------- acciones

/** Job principal: lo llama el disparador. */
function actualizarDashboard() {
  const json = JSON.stringify(construirPayload_(), null, 2);
  const res = publicarEnGitHub_(json);
  console.log('centro-de-mando: ' + res);
}

/** Ejecutar una vez a mano para comprobar que todo está bien. */
function probar() {
  const p = construirPayload_();
  console.log(JSON.stringify(p, null, 2).slice(0, 1200));
  console.log('tipos:', p.tipos.length, '| historia:', p.historia.length);
}

/** Crea (o recrea) el disparador cada 6 horas. */
function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'actualizarDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarDashboard')
    .timeBased()
    .everyHours(6)
    .create();
  console.log('Disparador cada 6 h instalado.');
}
