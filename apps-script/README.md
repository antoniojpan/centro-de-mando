# Publicación automática (Apps Script)

Con esto el dashboard **se actualiza solo cada 6 horas**, sin depender de ningún
ordenador encendido ni de que haya un agente despierto. El script vive dentro de
la hoja, así que Google le da acceso directo a los datos.

```
Google (disparador cada 6 h)
   └─ lee la pestaña registro
        └─ escribe data/dashboard.json en GitHub (API Contents)
             └─ GitHub Pages reconstruye la web
```

## Instalación (una vez, ~5 minutos)

### 1. Crear un token de GitHub limitado a este repo

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → *Generate new token*.
2. **Repository access**: *Only select repositories* → `centro-de-mando`.
3. **Permissions → Repository permissions → Contents: Read and write**.
   (Nada más.)
4. Caducidad: 1 año. Copia el token (`github_pat_…`).

> No uses el token clásico `ghp_` que hay en el vault: ese da acceso a todos tus
> repos. Este nuevo solo puede escribir en `centro-de-mando`.

### 2. Pegar el script en la hoja (SIN tocar el código existente)

⚠️ El proyecto **ya tiene código** (`nuevodia()`, que regenera la pestaña
`tendencias`). No pegues encima de `Código.gs`: lo borrarías.

1. Abre la hoja **Longevidad Gamificada**.
2. **Extensiones → Apps Script**.
3. En la columna de archivos, junto a *Archivos*, pulsa **+ → Secuencia de comandos**.
4. Ponle de nombre `centro_mando`.
5. Pega ahí el contenido completo de `apps-script/Code.gs`.
6. Guarda (Ctrl+S).

Todos los nombres del script llevan prefijo `cm`/`CM_` justamente para no chocar
con `nuevodia()` ni con nada del código que ya existe.

### 3. Guardar el token

En el editor de Apps Script: **Configuración del proyecto** (icono de engranaje)
→ **Propiedades del script** → *Añadir propiedad*:

| Propiedad | Valor |
|---|---|
| `GITHUB_TOKEN` | el token del paso 1 |

### 4. Comprobar y programar

En el editor, elige la función en el desplegable y pulsa *Ejecutar*:

1. **`cmProbar`** → en el registro debe salir `tipos: 7 | historia: ~60`.
   La primera vez pedirá autorizar permisos (leer la hoja, llamar a internet).
2. **`cmActualizarDashboard`** → debe escribir `publicado` (o `sin cambios`).
   Comprueba en GitHub que `data/dashboard.json` tiene un commit nuevo.
3. **`cmInstalarDisparador`** → refresco automático cada 6 horas.

Verificado: en la web aparece el sello `Snapshot: …` con la hora de la última
actualización. Si pasan más de 2 días, la página lo avisa en rojo.

## Mantenimiento

- **Rotar el token**: crear otro en GitHub y actualizar la propiedad
  `GITHUB_TOKEN`. Nada más que tocar.
- **Cambiar la frecuencia**: editar `.everyHours(6)` y volver a ejecutar
  `instalarDisparador`.
- **Ver ejecuciones**: Apps Script → *Ejecuciones*. GitHub → pestaña *Commits*.
- **Parar todo**: `ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t))`
  o borrar el disparador desde la interfaz.

## Alternativa sin token de GitHub

Si prefieres no tener ningún token guardado en Google, el sustituto es un
**workflow de GitHub Actions** que lea la hoja con una cuenta de servicio de
Google Cloud. Funciona igual, pero exige crear el proyecto, la cuenta de servicio,
compartir la hoja con su email y guardar la clave como secreto del repo. Más
piezas y más sitios donde equivocarse. El token fine-grained de este repo es la
opción más corta.
