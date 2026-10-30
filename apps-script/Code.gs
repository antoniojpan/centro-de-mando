/**
 * Centro de Mando — publicador automático de datos.
 *
 * Vive DENTRO de la hoja «Longevidad Gamificada» (Extensiones → Apps Script),
 * así que lee el spreadsheet sin autenticación y empuja `data/dashboard.json`
 * al repo de GitHub. Un disparador cada 6 h lo mantiene al día sin depender de
 * ningún ordenador ni de ninguna sesión de agente.
 *
 * IMPORTANTE: este archivo va en un archivo NUEVO del proyecto
 * (Archivo → + → Secuencia de comandos), NO encima de Código.gs.
 * Todos los nombres llevan prefijo cm/CM_ para no chocar con nuevodia() ni con
 * el resto del código existente de la hoja.
 *
 * Instalación: ver apps-script/README.md
 */

// ---------------------------------------------------------------- configuración

const CM_REPO = 'antoniojpan/centro-de-mando';
const CM_ARCHIVO = 'data/dashboard.json';
const CM_RAMA = 'main';
const CM_HOJA = 'registro';
const CM_DIAS_HISTORIA = 60;

// Fila 2 de la hoja: cabeceras reales (la 1 son metas calculadas).
const CM_FILA_DATOS = 3;
const CM_COL = {
  fecha: 1,        // A
  saldoTotal: 3,   // C
  peso: 11,        // K
  cintura: 15,     // O
  recuento: [24, 25, 26, 27, 28, 29, 30],  // X..AD
  totalDia: 31,                            // AE
  saldoTipo: [32, 33, 34, 35, 36, 37, 38], // AF..AL
};
const CM_FILA_NOMBRES = 2; // X2..AD2 -> nombres de los tipos

// ------------------------------------------------------------------- utilidades

function cmNumero_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v).trim().replace(/\u00a0/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function cmIsoFecha_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ------------------------------------------------------------------ construcción

function cmConstruirPayload_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CM_HOJA);
  if (!sh) throw new Error(`No existe la pestaña «${CM_HOJA}»`);

  // Las celdas de fecha son «solo fecha» a medianoche de la zona de la HOJA.
  // Hay que formatearlas con esa zona, no con la del script (que suele ser UTC):
  // si no, la fecha sale un día antes.
  const tz = ss.getSpreadsheetTimeZone();

  const nombres = sh
    .getRange(CM_FILA_NOMBRES, CM_COL.recuento[0], 1, CM_COL.recuento.length)
    .getValues()[0];

  const ultimaCol = CM_COL.saldoTipo[CM_COL.saldoTipo.length - 1];
  const filas = sh
    .getRange(CM_FILA_DATOS, 1, CM_DIAS_HISTORIA, ultimaCol)
    .getValues();

  const datos = [];
  for (const f of filas) {
    const fecha = cmIsoFecha_(f[CM_COL.fecha - 1], tz);
    if (!fecha) continue;
    datos.push({
      fecha,
      saldo_total: cmNumero_(f[CM_COL.saldoTotal - 1]),
      peso: cmNumero_(f[CM_COL.peso - 1]),
      cintura: cmNumero_(f[CM_COL.cintura - 1]),
      total_dia: cmNumero_(f[CM_COL.totalDia - 1]),
      recuento: CM_COL.recuento.map((c) => cmNumero_(f[c - 1])),
      saldo_tipo: CM_COL.saldoTipo.map((c) => cmNumero_(f[c - 1])),
    });
  }
  if (!datos.length) throw new Error('No hay filas con fecha válida en la hoja');

  // Las filas van de la más reciente (fila 3 = hoy) a la más antigua.
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

function cmPublicarEnGitHub_(json) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta la propiedad de script GITHUB_TOKEN');

  const api = `https://api.github.com/repos/${CM_REPO}/contents/${CM_ARCHIVO}`;
  const cabeceras = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  // ¿Existe ya? Necesitamos su sha para poder actualizarlo.
  const actual = UrlFetchApp.fetch(`${api}?ref=${CM_RAMA}`, {
    headers: cabeceras,
    muteHttpExceptions: true,
  });

  let sha = null;
  if (actual.getResponseCode() === 200) {
    const cuerpo = JSON.parse(actual.getContentText());
    sha = cuerpo.sha;
    const previo = Utilities.newBlob(
      Utilities.base64Decode(cuerpo.content),
      'application/json'
    ).getDataAsString();
    if (previo.trim() === json.trim()) return 'sin cambios';
  }

  const payload = {
    message: 'datos: actualización automática',
    content: Utilities.base64Encode(json, Utilities.Charset.UTF_8),
    branch: CM_RAMA,
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

/** Job principal: lo llama el disparador cada 6 h. */
function cmActualizarDashboard() {
  const json = JSON.stringify(cmConstruirPayload_(), null, 2);
  const res = cmPublicarEnGitHub_(json);
  console.log('centro-de-mando: ' + res);
}

/** Ejecutar una vez a mano para comprobar que lee bien la hoja. */
function cmProbar() {
  const p = cmConstruirPayload_();
  console.log('tipos:', p.tipos.length, '| historia:', p.historia.length);
  console.log(JSON.stringify(p.tipos, null, 2));
}

/** Crea (o recrea) el disparador cada 6 horas. Ejecutar una sola vez. */
function cmInstalarDisparador() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'cmActualizarDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cmActualizarDashboard')
    .timeBased()
    .everyHours(6)
    .create();
  console.log('Disparador cada 6 h instalado.');
}

/** Borra el disparador (para parar la publicación automática). */
function cmQuitarDisparador() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'cmActualizarDashboard') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  console.log(`Disparadores eliminados: ${n}`);
}

// ------------------------------------------------- API web (lectura/escritura)

/* Columnas de la pestaña registro donde se anotan las series, en el mismo
 * orden que los tipos (D..J). */
const CM_COL_TIPO = [4, 5, 6, 7, 8, 9, 10];

function cmRespuesta_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Fila de hoy: la que tiene la fecha de hoy según la hoja. */
function cmFilaDeHoy_(sh, tz) {
  const filas = sh.getRange(CM_FILA_DATOS, 1, 5, 1).getValues();
  const hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  for (let i = 0; i < filas.length; i++) {
    if (cmIsoFecha_(filas[i][0], tz) === hoy) return CM_FILA_DATOS + i;
  }
  return CM_FILA_DATOS; // la fila 3 es «hoy» por fórmula
}

/**
 * Añade `n` series de un tipo, en la fila de hoy.
 * Se añade un token con coma, que es lo que cuenta la hoja.
 */
function cmAnadirSeries_(idx, n) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CM_HOJA);
  const tz = ss.getSpreadsheetTimeZone();
  const col = CM_COL_TIPO[idx];
  if (!col) throw new Error('Tipo de ejercicio fuera de rango');

  const fila = cmFilaDeHoy_(sh, tz);
  const celda = sh.getRange(fila, col);
  const previo = String(celda.getValue() || '').trim();
  const nuevo = (previo ? previo.replace(/,+$/, '') + ',' : '') +
                '1,'.repeat(Math.max(1, Math.min(n || 1, 20)));
  celda.setValue(nuevo);

  SpreadsheetApp.flush(); // fuerza el recálculo de las fórmulas
  return { fila, columna: col, valor: nuevo };
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'dashboard') return cmRespuesta_(cmConstruirPayload_());
    return cmRespuesta_({ error: 'accion desconocida' });
  } catch (err) {
    return cmRespuesta_({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return cmRespuesta_({ error: 'cuerpo no es JSON' });
  }

  const clave = PropertiesService.getScriptProperties().getProperty('CM_CLAVE');
  if (clave && body.clave !== clave) {
    return cmRespuesta_({ error: 'clave incorrecta' });
  }

  try {
    if (body.action === 'add') {
      const idx = Number(body.idx);
      const n = Number(body.n || 1);
      const escrito = cmAnadirSeries_(idx, n);

      // Refresca el JSON estático para el resto de dispositivos (best-effort).
      try {
        cmPublicarEnGitHub_(JSON.stringify(cmConstruirPayload_(), null, 2));
      } catch (err) {
        console.log('aviso: no se pudo publicar en GitHub: ' + err);
      }

      return cmRespuesta_({
        ok: true,
        escrito,
        dashboard: cmConstruirPayload_(),
      });
    }
    return cmRespuesta_({ error: 'accion desconocida' });
  } catch (err) {
    return cmRespuesta_({ error: String(err && err.message || err) });
  }
}
