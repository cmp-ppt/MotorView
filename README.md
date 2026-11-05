# MotorView-cmp
Sistema de Gestión de Motores de Compañía Minera del Pacífico.

Centraliza los motores eléctricos del área eléctrica de las faenas de CMP: características técnicas,
estado, ubicación y disponibilidad (repuestos, reservados, en transporte y en taller).

Sitio estático (HTML, CSS y JavaScript, sin frameworks ni build) publicado en **GitHub Pages**, con los datos,
los usuarios y el login en **Supabase**.

## Qué incluye
- **Resumen:** KPIs, estado de la flota, motores por área, potencia y tensión; cada gráfico filtra el inventario.
- **Inventario:** búsqueda y filtros por las columnas de la planilla (con la misma cabecera de dos filas), orden,
  exportación a CSV y ficha técnica por motor.
- **Disponibilidad:** repuestos, reservados, en transporte y en taller, y **cobertura de repuestos**: por tipo de motor
  (potencia, voltaje y polos) cuántos hay en servicio y cuántos de repuesto, y cuáles quedan sin respaldo.
  Al abrir un motor se sugieren repuestos compatibles.
- **Calidad de datos:** qué falta o está mal en la planilla (sin área, sin TAG, N° repetido, datos de placa o cos φ faltantes,
  sin criticidad). Cada problema abre la lista de motores afectados.
- **Reparaciones y rebobinados:** historial por motor (tipo, fecha, taller, trabajo, pruebas y garantía), solo se agrega.
- **Criticidad A, B o C** por motor, con un indicador de críticos por área.
- **Edición con historial:** cada cambio de estado, ubicación, criticidad u observaciones queda con quién, cuándo, valor anterior y motivo.
  La fecha y el usuario los pone la base de datos, no el navegador.
- Estados: En servicio, Taller, Repuesto, Reservado, En transporte, De baja.
- Visual: encabezado con un motor y relieve minero dibujados para la aplicación, tarjetas por faena con su estado e íconos por tipo de montaje.

## Puesta en marcha

### 1. Supabase
1. Usa un proyecto de Supabase (puede ser el mismo de otras apps: las tablas llevan prefijo `motorview_`).
2. **SQL Editor → New query:** pega `supabase/esquema.sql` → Run. Crea tablas, roles, historial, reparaciones y políticas RLS.
   Se puede volver a ejecutar sin perder datos: **al actualizar la aplicación, ejecútalo de nuevo** antes de publicar los cambios.
3. **Carga inicial:** genera el SQL con el listado Excel y pégalo en el SQL Editor (ver *Datos*).
4. **Usuarios:** Authentication → Users → Add user (correo y contraseña, con *Auto Confirm User*). Luego dales perfil y rol
   (el SQL está al final de `supabase/esquema.sql`):

   ```sql
   insert into public.motorview_perfiles (user_id, nombre, rol)
   select id, 'Nombre Apellido', 'mantenimiento' from auth.users where email = 'persona@cmp.cl';
   ```

| Rol | Puede |
|---|---|
| `admin` | Ver todo y editar |
| `mantenimiento` | Ver y editar estado, ubicación, criticidad y observaciones; registrar reparaciones |
| `consulta` | Solo ver |

Una cuenta de Supabase **sin perfil activo no ve ningún motor**. Para quitar acceso: `update public.motorview_perfiles set activo = false where …`.

### 2. Conectar el sitio
En `js/config.js` pega la **Project URL** y la clave **anon / publishable** (Project Settings → API).
**Nunca** la `service_role` ni `sb_secret_…`: la app se niega a usarla.

### 3. Publicar
Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

Los archivos se cargan con un número de versión (`?v=…` en `index.html`). **Al cambiar CSS o JavaScript, sube ese número** en todos los enlaces: así el navegador no mezcla archivos nuevos con copias viejas guardadas.

Para probarlo en local, sírvelo (no abras el archivo con doble clic): `python3 -m http.server 8000`.

## Datos
El inventario real **no está en este repositorio** (`.gitignore` bloquea `*.xlsx`, `data/` y `semilla*.sql`): vive solo en Supabase.
Para la carga inicial:

```bash
pip install openpyxl
python3 tools/build_seed_sql.py LISTADO.xlsx "Planta Magnetita" semilla.sql
```

Pega `semilla.sql` en el SQL Editor (después de `esquema.sql`). Se puede repetir sin pisar lo ya cargado.
Para sumar otra faena, repite con su Excel y otro nombre de faena (los `id` deben ser distintos: ajusta el inicio si hace falta).

**Estado y ubicación iniciales son inferidos** del TAG, la descripción, las observaciones y la ruta de la hoja de vida
(p. ej. "TALLER", "DE BAJA", carpeta "Motores de Repuestos"). Deben validarse con Mantenimiento.
El listado trae datos faltantes o inconsistentes (38 motores quedan "Sin clasificar").

## Seguridad
- La clave publicable viaja en el navegador: es pública por diseño. Lo que protege los datos son las políticas RLS:
  sin login no hay lectura ni escritura, y sin perfil activo tampoco.
- La edición está limitada por columna en la base (solo `estado`, `area`, `observaciones`, `criticidad`, `motivo`). Las reparaciones solo se agregan
  (quién y cuándo lo registró lo pone la base); no hay insert ni delete de motores desde la app.
- No hay registro desde la aplicación: las cuentas las crea el administrador en Supabase.
- La política de contenido (`Content-Security-Policy`) solo permite scripts propios y conexiones a `*.supabase.co`.
- Comprobación: `set role anon; select count(*) from public.motorview_motores;` debe fallar con *permission denied*.

## Pruebas
```bash
node --test tests/*.test.js
```

## Estructura
```
index.html              página única
css/app.css             estilos (claro/oscuro, responsive)
js/config.js            URL y clave publicable de Supabase
js/sesion.js            login, renovación y cierre de sesión (Supabase Auth)
js/nube.js              lectura y escritura de motores, perfil, historial y reparaciones (PostgREST)
js/analisis.js          calidad de datos, cobertura de repuestos y criticidad (funciones puras)
js/boot.js              arranque: configuración, login y carga de datos
js/app.js               vistas: resumen, inventario, disponibilidad, calidad y ficha
img/cmp.png             logo de CMP
supabase/esquema.sql    tablas, disparadores de historial y reparaciones, y políticas RLS
tools/build_seed_sql.py Excel → SQL de carga inicial
tests/                  pruebas de sesión, mapeo de datos y análisis
```

## Próximos pasos
Carga de las demás faenas y traspaso de motores entre ellas, etiquetas QR por motor, gestión de usuarios desde la interfaz,
carga de planillas por el administrador, respaldos y campos adicionales de la ficha.

El logo de CMP (`img/cmp.png`) es marca de la compañía y se usa con su autorización.
