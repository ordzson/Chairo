# Verificación de implementación

Fecha: 15 de septiembre de 2026

## Resultado

- `pnpm build`: aprobado.
- `pnpm test`: 12/12 pruebas aprobadas en Chromium (23.4 s en la ejecución final).
- `pnpm check`: aprobado; bundle inicial de 145.44 kB sin comprimir y 41.91 kB estimados en transferencia.
- Metadatos de prompts: 5 rasters revisados, 0 prompts faltantes.
- Detector de interfaz: un aviso mecánico por animar `width` y `margin`; corregido dejando solo la transición de `filter`.

## Cobertura de navegador

La suite valida los anchos 320, 390, 941, 1280 y 1440 px; accesibilidad automatizada con axe; estructura y orden de los seis juegos; pestañas verticales; flechas, Inicio y Fin; preferencia persistente; fallos y valores inválidos de `localStorage`; zoom al 200 %; movimiento reducido y colores forzados.

## Evidencia visual

- `mobile.png`: vista móvil de 390 px.
- `width-320.png`: límite móvil inferior.
- `comp-size.png`: comparación a 941 px, el ancho del comp aprobado.
- `width-1280.png`: escritorio intermedio.
- `desktop.png`: escritorio de 1440 px.
- `diff/comp-size/`: comparación automatizada con el comp al mismo ancho.
- `diff/final/`: comparación adicional de la captura de escritorio.

La inspección humana confirmó la jerarquía y el mundo material aprobados: marca centrada, índice apilado, primera pestaña seleccionada, panel de acetato, ilustración de escenario y tarjeta de preferencia. La implementación conserva esa composición y ajusta densidad y escala para legibilidad responsiva.

## Nota sobre la puerta de placas

La herramienta `impeccable comp-spec --crop` produjo muestras planas para algunos recortes, mientras que su variante `--raw` devolvió el arte correcto. Se regeneraron `brand`, `stage` y `brush` desde esas referencias correctas, con alfa real y prompts incrustados. La puerta automática continuó dando resultados contradictorios —por ejemplo, 37 % de estructura y 95 % de semejanza con el recorte para la misma marca—, por lo que no se forzó ni se declaró aprobada. Se conservaron el estado fallido y sus evidencias, aunque los assets finales, la inspección visual y las pruebas de la aplicación sí son válidos.

## Revisión de cierre

El revisor independiente de Impeccable emitió la disposición `ship`: fidelidad aceptada, techo de oficio alcanzado y ninguna corrección material pendiente. Su única observación de persistencia fue la excepción de estado anterior. El comando formal `impeccable build-phase finish --disposition ship` se intentó sin forzar y fue rechazado porque `plates`, `hero`, `sections`, `motion` y `responsive` no están cerrados. Esto mantiene el registro del flujo fiel a la anomalía de la herramienta y no cambia la aprobación de la aplicación terminada.

La documentación del sistema visual se generó después de la revisión en `DESIGN.md` y `.impeccable/design.json` (schemaVersion 2).


# Etapa 2 · Sala de espera del anfitrión

Fecha: 15 de septiembre de 2026

## Resultado

- `pnpm run build`: aprobado. Aviso previo de presupuesto inicial (262.76 kB frente a 250 kB) heredado del enrutado; esta etapa añade 1.27 kB iniciales y 29.39 kB en el fragmento diferido `room-page`.
- `pnpm test`: 37/37 pruebas aprobadas en Chromium (51.5 s), frente a las 20 de la etapa anterior.
- Detector de interfaz: 0 anti-patrones. Solo avisos consultivos de la misma clase que ya arrastra la pantalla de configuración (radios de papel recortado a mano y colores cálidos literales), más tres valores nuevos deliberados: `#cbbb99` para la etiqueta neutra, `#e8e3d5` y `#33447a` para el botón inactivo.

## Cobertura nueva

Creación de sala con código válido, restauración tras recarga, contenido del QR, copia de la invitación y su fallo, botón de comienzo deshabilitado y habilitado al entrar un participante listo, cierre de sala, sala inexistente con reintento, código imposible, modo Solo anfitrión, anchos 320, 390, 941 y 1440 px con axe, teclado, movimiento reducido y colores forzados.

El codificador QR propio se contrastó módulo a módulo con `python-qrcode` en las versiones 1 a 10 y las ocho máscaras (104 combinaciones idénticas) y su función de penalización devuelve los mismos valores; la implementación elige además la máscara de menor penalización. La prueba `tests/versiculo-domain.spec.ts` conserva esa comparación contra el patrón generado externamente en `tests/fixtures/qr-join-abcd.json`.

## Evidencia visual

- `sala-width-320.png`, `sala-width-390.png`, `sala-width-941.png`, `sala-width-1440.png`: sala esperando participantes.
- `sala-lista-390.png`: sala con un invitado listo y el botón de comienzo activo.

La inspección humana confirmó la composición del comp aprobado: banda azul con rol, tarjeta de invitación con QR y código sobre pincelada, participantes, resumen, comienzo y compartir. Se corrigieron en el mismo lote el QR desproporcionado en escritorio, la cápsula perfecta bajo el código —sustituida por la pincelada real del manual—, la etiqueta partida en dos líneas, el área táctil de `Cerrar sala` y el peso excesivo del botón inactivo.

Disposición: **ship** para la pantalla de sala de espera.


# Etapa 3 · Entrada del invitado

Fecha: 15 de septiembre de 2026

## Resultado

- `pnpm run build`: aprobado. El aviso de presupuesto inicial sube de 263.78 kB a 264.80 kB: +1.02 kB, todo del entorno de Angular que entra al usar `output()` en la cabecera común. Se midió y se retiró el gasto mayor: `effect()` costaba 1.66 kB adicionales y se sustituyó por una llamada explícita, que además es más legible. El tramo diferido nuevo es `join-page`, 20.88 kB.
- `pnpm test`: 54/54 pruebas aprobadas en Chromium (1.4 min), frente a las 37 de la etapa anterior. Las 37 anteriores siguen aprobadas sin tocarlas.
- Detector de interfaz: 0 anti-patrones. 21 avisos consultivos en los archivos nuevos, veinte de ellos valores copiados literalmente de las pantallas ya aprobadas —el material de la placa azul, el papel de las tarjetas y la familia apagada del estado inactivo— y uno nuevo deliberado, `#cfc9b8`, para la marca de un color ya tomado.
- `node supabase/verify.mjs`: al escribir esta etapa fallaba con `Anonymous sign-ins are disabled`, así que se implementó y verificó contra el adaptador en memoria. **Actualización del mismo día**: el propietario activó el acceso anónimo y la comprobación volvió a correr. Doce de catorce pasan; fallan «el anfitrión cierra la sala» y su consecuencia «la sala cerrada deja de verse». Detalle en la sección siguiente.
- `supabase/schema.sql`: sin cambios. `leaveRoom` se apoya en la política `participants_delete_self_or_host` que ya existe, y `self` solo añade `user_id` a las columnas leídas, que `participants_select_open_room` ya permite. No hay SQL que aplicar.

## Cobertura nueva

Diecisiete pruebas: entrada desde la URL del QR con el código puesto; entrada escribiendo el código a mano; rechazo de caracteres ambiguos tecleados y pegados, con la explicación de cuál se descartó; código incompleto al enviar; sala inexistente y su corrección sin recargar; sala llena; colores tomados marcados como no disponibles y fuera del recorrido de teclado; nombre repetido resuelto por la sala; color tomado en el último instante, con el error llegando del envío y no adelantado; unión correcta; vista de espera del invitado sin ningún mando del anfitrión; recarga que no expulsa; salida que retira solo el asiento propio y deja la sala en pie; aparición del invitado en la pantalla del anfitrión sin recargar; anchos 320, 390, 941 y 1440 px con axe; y teclado, foco visible, movimiento reducido y colores forzados.

La suite sigue sin red: `tests/offline.ts` sirve una configuración vacía y la aplicación elige el adaptador en memoria.

Tres defectos reales aparecieron durante la verificación y se corrigieron: los campos de código y nombre no tenían nombre accesible —axe lo marcó como crítico— y ahora lo toman del rótulo de su sección; el campo de código no borraba el carácter rechazado cuando lo tecleado se descartaba entero, porque la señal no cambiaba y el enlace no reescribía el campo; y `maxlength` recortaba lo pegado antes de filtrar, de modo que un código con caracteres ambiguos perdía además letras válidas. El recorte lo hace ahora la regla del dominio, que filtra primero y corta después.

## Deuda saldada

La cabecera del manual —anillos, botón de vuelta y marca— era la misma en `setup.page.css` y `room.page.css`. Ahora es `ui/manual-header.component.ts`, que las tres pantallas comparten; cada una ajusta por variables las cinco medidas que difieren. La comprobación fue de capturas antes y después: siete de las ocho son idénticas byte a byte, y `setup-width-320.png` difiere en 679 píxeles con una desviación máxima de 18 sobre 255. Se descartó un desplazamiento de composición comparando la misma región con la imagen corrida un píxel: la diferencia sin desplazar es de 380 frente a unas 325.000 con cualquier corrimiento, así que la alineación es exacta y el resto es suavizado del rótulo.

También se subió `.sr-only` a `src/styles.css`, donde ya lo necesitan dos pantallas.

## Evidencia visual

- `unirse-width-320.png`, `unirse-width-390.png`, `unirse-width-941.png`, `unirse-width-1440.png`: entrada del invitado con dos colores ya tomados.
- `unirse-listo-390.png`: formulario completo, con nombre y color elegidos.
- `sala-invitado-390.png`: la sala de espera vista por el invitado.

La revisión visual confirmó la continuidad del mundo aprobado: misma cabecera encuadernada, placa azul del rótulo, hoja de papel con secciones separadas por filete, piezas moldeadas del sistema `.pressable` y nota manuscrita del margen. Se corrigieron en el mismo lote dos defectos de escritorio: la rejilla de colores quedaba coja con `auto-fit` y pasó a tres columnas exactas para los seis colores, y «No disponible» se partía en dos líneas.

Cada color lleva su propia forma —círculo, cuadrado, triángulo, rombo, pentágono y estrella— y su nombre en texto, así que ninguno depende del color para distinguirse; con `forced-colors` activo la forma y el nombre siguen en pie.

Disposición: **ship** para la pantalla de entrada del invitado y para la variante de invitado de la sala.

## Verificación remota, una vez activado el acceso anónimo

Las rutas que esta etapa añade se comprobaron contra el proyecto real y son correctas: el invitado entra, `user_id` se lee para resolver `self`, `leaveRoom` borra una fila propia y cero ajenas, la sala sigue en pie tras la salida, y el nombre y el color repetidos devuelven `participants_room_name_key` y `participants_room_color_key`, que son exactamente los nombres que traduce `joinError()`.

Aparecieron dos problemas que no son de esta etapa y que quedan pendientes:

**1. La base remota no corre el `supabase/schema.sql` del repositorio.** El anfitrión puede escribir `status` y `started_at`, pero al escribir `closed_at` recibe `403 new row violates row-level security policy for table "rooms"`. Escribir `closed_at = null` sí pasa. Eso solo ocurre si el `WITH CHECK` de la política de actualización exige `closed_at is null`, condición que el archivo del repositorio no tiene. La consecuencia es que **`closeRoom` no funciona contra el proyecto real**: el anfitrión no puede cerrar la sala y su código sigue reservado. El adaptador además no comprueba el error de esa escritura, así que la pantalla vuelve a la configuración como si hubiera funcionado. `DELETE` sobre `rooms` sí funciona, así que la política de borrado está bien.

**2. `room-full` es inalcanzable, ahora confirmado con datos.** Con cinco asientos ocupados, el siguiente rebota con `participants_room_color_key` y nunca con el `room-full` del disparador. Contando el amarillo del anfitrión, el techo real de la sala son seis asientos y no ocho. La entrada del invitado ya distingue los dos casos, pero el catálogo de colores y `MAX_PARTICIPANTS` siguen sin coincidir.

**3. `supabase/verify.mjs` comprueba dos cosas por la razón equivocada.** Reutiliza el token del mismo invitado para pedir nombre y color repetidos, así que lo que rebota es `participants_room_user_key` —un asiento por dispositivo— y no los índices de nombre y color. Su bucle de sala llena repite cuatro colores para seis invitados, de modo que la mayoría de altas fallan en silencio y la sala nunca llega a ocho. Con dispositivos distintos, los tres casos se comprueban de verdad.

La prueba a mano con dos navegadores contra Supabase sigue pendiente, y conviene hacerla después de alinear el esquema, no antes.


# Etapa 3 · Cierre de la verificación remota

Fecha: 16 de septiembre de 2026

## Resultado

- `pnpm run build`: aprobado. El presupuesto inicial sigue en 264.80 kB, sin mover ni un byte: todo lo añadido cae en el tramo diferido `room-page`, que pasa de 29.39 kB a 30.34 kB.
- `pnpm test`: 56/56 en Chromium, frente a 54. Dos pruebas nuevas y ninguna tocada salvo la de sala completa, que describía una sala imposible.
- Detector de interfaz: 0 anti-patrones. El aviso nuevo no añade ningún color ni radio al sistema.
- `node supabase/verify.mjs`: 15 de 18. Las tres que fallan dependen del SQL que el propietario tiene que aplicar, y ninguna es de código.
- `node supabase/verify-navegadores.mjs`: 7 de 8 contra el proyecto real, con la misma dependencia.

## 1. El esquema vivo, medido

El esquema remoto **sí** coincide con el archivo. Se comprobó columna a columna desde una sesión anónima: `rooms` trae `id, code, host_id, difficulty, question_count, host_role, status, created_at, started_at, closed_at` y `participants` trae `id, room_id, user_id, name, color, role, status, plays, joined_at`, en el mismo orden que `supabase/schema.sql`. `server_now()` responde.

No había ninguna deriva. **El diagnóstico heredado era incorrecto** y se corrige en la sección siguiente.

Aun así `supabase/schema.sql` se quedó convergente, que era una debilidad real aunque no fuera esta causa: antes de crear sus políticas retira cualquier otra de `rooms` o `participants` que el archivo no declare, porque `drop policy if exists` solo alcanza a las que se llaman igual. Volver a aplicarlo entero deja la base como el repositorio, tenga lo que tenga.

## 2. La escritura de salida ya no se traga el error

`closeRoom` comprueba el error del `update` y lo propaga como `MultiplayerError`; `leaveRoom` hace lo mismo con su `delete`, que tenía el mismo agujero. No se cuentan las filas devueltas, porque no distinguen nada: la sala recién cerrada deja de verse por `rooms_select_open`, así que un cierre correcto devuelve la misma lista vacía que una sala que ya no estaba, y ambos casos dejan la sala cerrada.

`exitRoom()` ya no navega pase lo que pase. Si la escritura falla, nadie se mueve de donde está y aparece el aviso junto al mando que hay que volver a tocar: «No pudimos cerrar la sala: sigue abierta y nadie ha salido», y su equivalente para el invitado. Una sala que ya no existe es la excepción: no retiene a nadie, así que la salida se cumplió sola y la navegación sigue.

El aviso no reserva hueco cuando no hay nada que decir, a diferencia de `.live-status`, para no dejar un espacio en blanco permanente bajo el último mando de la composición aprobada.

Está cubierto sin red. `tests/offline.ts` suma `withStubbedBackend`, que sirve una configuración de Supabase apuntando al mismo puerto del servidor estático y contesta desde Playwright cada petición REST: así corre el adaptador remoto de verdad —el único que puede fallar ahí— sin que salga un byte de la máquina. Las dos pruebas nuevas rechazan la escritura con el `42501` real, comprueban el aviso y que la sala sigue en pantalla, y después aceptan la escritura para confirmar que volver a tocar el mando funciona, que es lo que promete el texto.

Y se vio ocurrir contra el proyecto real: el aviso del anfitrión es hoy la salida verdadera de `verify-navegadores.mjs`, porque la política vieja sigue rechazando el cierre.

## 3. El tope de la sala son 6 — decisión del propietario

El propietario eligió bajar el tope en lugar de ampliar el catálogo de colores, que habría tocado `GameColor`, global a toda la aplicación.

`MAX_PARTICIPANTS` ya no se escribe aparte: es `PARTICIPANT_COLORS.length`. El color identificador es único dentro de la sala, así que hay exactamente un asiento por color y el catálogo *es* el techo; escribir el número dos veces fue lo que dejó prometidos ocho asientos que la sala nunca pudo dar. El disparador `guard_participant_insert()` corta en 6, y como corre antes que los índices, `room-full` vuelve a ser alcanzable: con la sala llena el séptimo recibe `room-full` aunque además pida un color tomado.

Consecuencia que sí cambia la interfaz: los dos techos eran uno solo. `colors-gone` —«No quedan colores libres»— solo podía verse con menos asientos que colores, y ya no existe ese hueco, así que se retiró junto con su copia. `color-taken`, que es otra cosa —alguien tomó ese color mientras lo elegías—, sigue en pie y sigue probado.

Textos actualizados: `de 2 a 6` en `domain/room.ts`, en la superficie de impeccable y en el brief visual. `PRODUCT.md` y `DESIGN.md` no citaban ningún número.

## 4. `verify.mjs` comprueba lo que dice comprobar

Cada alta de participante usa ahora una sesión anónima nueva. Con el token del mismo invitado lo que rebotaba era `participants_room_user_key` —un asiento por dispositivo— y las dos comprobaciones pasaban por la razón equivocada; ahora devuelven `participants_room_name_key` y `participants_room_color_key`, que son los nombres que traduce `joinError()`, y el guion los exige por nombre en lugar de conformarse con un `23505` cualquiera.

El bucle de sala llena ya no repite colores: cuatro invitados con los cuatro colores libres completan los seis asientos, y el séptimo tiene que recibir `room-full`. La comprobación de cierre dice el código y el mensaje cuando falla, en lugar de callar.

## 5. Dos navegadores contra el proyecto real

La prueba a mano quedó hecha guion en `supabase/verify-navegadores.mjs`: dos contextos de navegador son dos sesiones anónimas distintas, que es lo que separa al anfitrión del invitado. Vive fuera de `tests/` a propósito, porque la suite no toca la red, y borra su sala al terminar pase lo que pase para no dejar el código reservado.

Siete de las ocho comprobaciones pasan: el anfitrión crea la sala en el proyecto real, el QR se dibuja a 212 px, el invitado entra desde su propia sesión, **aparece en la pantalla del anfitrión sin recargar** —realtime entrega el `INSERT` sobre `participants`, confirmado en el websocket—, el invitado ve «Esperando a que el anfitrión comience» y ninguno de los cuatro mandos del anfitrión, recargar no lo expulsa ni le cambia el asiento, y salir retira solo su asiento dejando la sala en pie. La octava, «Cerrar sala», es la que espera el SQL.

Sigue pendiente de mano lo único que un guion no puede hacer: escanear el QR con un teléfono de verdad.

## Lo que falta, y es del propietario

Tres comprobaciones de `verify.mjs` y una de `verify-navegadores.mjs` fallan por la misma causa y se arreglan con el mismo SQL, que no se puede aplicar desde el repositorio: no hay `service_role` ni cadena de conexión, y la clave publicable no alcanza. En el SQL Editor del proyecto:

1. `supabase/schema.sql` entero, que es idempotente y ahora retira también las políticas viejas con otro nombre.
2. La sala sobrante de las pruebas anteriores, que ninguna otra sesión puede cerrar:

```sql
update public.rooms set closed_at = now() where code = '8RBP' and closed_at is null;
```

Después, `node supabase/verify.mjs` debe dar 18 de 18 y `node supabase/verify-navegadores.mjs` 8 de 8.


# Etapa 3 · Por qué no se podía cerrar la sala

Fecha: 16 de septiembre de 2026

El propietario aplicó `supabase/schema.sql` entero. El disparador cambió —`el séptimo recibe room-full` pasó a estar bien por primera vez— pero el cierre seguía devolviendo `403 42501`. Eso descartó la deriva de esquema, porque el archivo había corrido de verdad.

## La causa

No era una política vieja. Es el propio archivo, y lo era desde el principio.

PostgREST añade siempre `RETURNING` a la escritura para contar las filas afectadas, y Postgres exige que la fila **nueva** siga pasando la política de `SELECT`. `rooms_select_open` era `closed_at is null`, así que escribir `closed_at` volvía la fila invisible en ese mismo instante y el propio cierre se rechazaba. Ninguna otra escritura sobre `rooms` toca la visibilidad, y por eso `status` y `started_at` pasaban, `closed_at = null` pasaba y solo `closed_at = <fecha>` fallaba. `DELETE` funcionaba porque la fila que devuelve es la vieja, que sí era visible.

## Cómo se descartó lo demás

- Medido: el `403` sobrevive con `Prefer: return=minimal`, así que no dependía del cuerpo pedido. PostgREST cuenta filas igualmente.
- Medido: un fallo de `WITH CHECK` provocado a propósito —cambiar `host_id` a otro dueño— devuelve un mensaje **idéntico** al del cierre, así que el texto del error no distinguía las dos hipótesis.
- Desde fuera eran indistinguibles: la política de lectura solo dependía de `closed_at`, así que no hay ninguna escritura que separe una hipótesis de la otra a través de PostgREST. Lo resolvió el volcado de `pg_policies` pedido al propietario: cuatro políticas sobre `rooms`, todas `PERMISSIVE`, con `rooms_update_host` en `with check (host_id = auth.uid())`. Nada viejo que borrar.

## El arreglo

`rooms_select_open` pasa a `closed_at is null or host_id = auth.uid()`. Una sala abierta la ve cualquiera que tenga su código; una cerrada, solo quien la abrió. No es comodidad: es lo que deja pasar el `RETURNING`. El invitado sigue sin ver ninguna sala cerrada, y `participants_select_open_room` comprueba `closed_at is null` por su cuenta, así que los participantes de una sala cerrada siguen ocultos para todos.

En el adaptador, `refresh()` filtra ahora `closed_at is null`. Antes se apoyaba sin decirlo en que la política escondiera la sala cerrada; ahora que el anfitrión puede verla, el filtro explícito es lo que hace que una sala cerrada desaparezca de su pantalla.

`verify.mjs` comprueba las dos mitades del invariante: el invitado no ve la sala cerrada **sin filtrar por `closed_at`**, que es lo que prueba que la esconde la política y no la consulta, y el anfitrión sí la ve, que es lo que le permite cerrarla.

## Hallazgo aparte: `close_stale_rooms` estaba al alcance de cualquiera

Medido contra el proyecto real: una sesión anónima recién creada puede llamar `/rest/v1/rpc/close_stale_rooms` y recibe `200`. La función es `security definer`, así que salta RLS por diseño; con `'0 seconds'` cualquier jugador habría cerrado todas las salas abiertas del proyecto, incluidas las partidas de otros.

El archivo ahora la retira del alcance de `anon` y `authenticated`. La aplicación no la llama —no hay ninguna llamada a `rpc(` en `src/`—, así que revocarla no quita nada: limpiar sigue siendo tarea del propietario o de pg_cron.

## Estado final, medido tras aplicar el arreglo

- `node supabase/verify.mjs`: **todo correcto**, las diecinueve comprobaciones.
- `node supabase/verify-navegadores.mjs`: **todo correcto**, las ocho. «Cerrar sala» cierra la sala de verdad contra el proyecto real.
- `close_stale_rooms` desde una sesión anónima: `403 permission denied for function close_stale_rooms`. Antes devolvía `200`.
- Salas abiertas en el proyecto: ninguna. Las dos residuales quedaron cerradas.
- `pnpm run build` aprobado con el presupuesto inicial intacto en 264.80 kB, `pnpm test` 56/56 y el detector en 0 anti-patrones.

Queda pendiente de mano lo único que un guion no puede hacer: escanear el QR con un teléfono de verdad.

Disposición: **ship** para la etapa 3, ahora también contra el proyecto real.


# Despliegue · GitHub Pages

Fecha: 16 de septiembre de 2026

Repositorio público `ordzson/Chairo`, sitio en **https://ordzson.github.io/Chairo/**. Cada empujón a `main` compila y publica con `.github/workflows/deploy.yml`. No hizo falta ninguna reescritura: el build usa `base-href ./` y el enrutado va por almohadilla, así que el sitio funciona bajo `/Chairo/` igual que en la raíz.

Fuera del repositorio quedan 104 MB de capturas de revisión y el ejecutable de 15 MB de la skill, que se instala y no se versiona. Los registros en texto —superficie, verificación, `design.json`, prompts y procedencia— sí se versionan, que es donde vive el porqué de cada decisión. El árbol publicado son 27 MB.

## Comprobado contra el sitio publicado, no contra localhost

`verify-navegadores.mjs` acepta ahora `CHAIRO_URL`, así que la misma prueba sirve para la copia local y para el despliegue:

```sh
CHAIRO_URL=https://ordzson.github.io/Chairo/ node supabase/verify-navegadores.mjs
```

Con el servidor local apagado —comprobado, `curl` a 4173 devuelve `000`— las ocho comprobaciones pasan contra Pages: crear sala, QR, entrada del invitado desde otra sesión anónima, aparición sin recargar, espera sin mandos de anfitrión, recarga que no expulsa, salida que retira solo su asiento y cierre de sala.

La invitación que reparte el sitio publicado se leyó del portapapeles y es absoluta y correcta: `https://ordzson.github.io/Chairo/#/juegos/versiculo-o-inventiculo/unirse/<código>`. El QR lleva esa misma URL, porque ambos salen de `joinUrl()`.

Ninguna de estas pruebas dejó salas abiertas.


# Etapa 4 · Partida de ¿Versículo o inventículo?

Fecha: 16 de septiembre de 2026

## Resultado

- `pnpm run build`: aprobado. El CSS de la nueva pantalla queda dentro del presupuesto por componente; continúa el aviso inicial heredado, ahora en 267.12 kB frente a 250 kB.
- `pnpm test`: **62/62** en Chromium, incluida la partida real, el bloqueo de respuesta, resultados, selección del banco, reglas de tiempo/puntos, accesibilidad y reflujo.
- Detector de Impeccable sobre los archivos tocados: 54 avisos consultivos de la paleta/radios incumbentes, **0 hallazgos no consultivos**.
- Metadatos de generación: **7 raster, 0 prompts ausentes**.
- Revisión final independiente: **ship**, sin correcciones materiales.

## Flujo verificado

La sala comienza de verdad y todos navegan a `partida/:codigo`. La secuencia implementada es cuenta regresiva → pregunta → respuesta bloqueada/espera → revelación con evidencia y puntos → siguiente ronda → clasificación final. La vista Solo anfitrión conduce sin responder. Una recarga recupera el estado de la partida.

El reloj y el puntaje tienen autoridad de servidor en Supabase: tablas privadas para partida/respuestas y RPC autenticadas para comenzar, leer y responder. La solución solo sale durante la revelación. El adaptador local conserva el mismo contrato para la suite sin red.

## Evidencia visual

- `.impeccable/review/partida-mobile.png`: pregunta a 390 px, con las dos decisiones completas dentro del flujo visible.
- `.impeccable/review/partida-desktop.png`: la misma jerarquía a 1440 px.
- `assets/versiculo-o-inventiculo/06-cuenta-regresiva.png`: concepto generado para la transición de 3 segundos.
- `assets/versiculo-o-inventiculo/07-respuesta-enviada.png`: concepto generado para la espera sin revelar la solución.

La primera captura móvil mostró «INVENTÍCULO» recortado dentro de su botón aunque la página no desbordaba. Se corrigió la escala tipográfica móvil y se recapturó antes del veredicto.

## Supabase pendiente de despliegue

`supabase/schema.sql` contiene la ampliación, pero esta sesión no la aplicó al proyecto remoto. La validación transaccional local tampoco pudo ejecutarse: la instancia exige el usuario de sistema `postgres` y el entorno no dispone de sudo sin contraseña. Por tanto, la etapa queda terminada en código y pruebas sin red; para habilitar partidas reales entre teléfonos hay que aplicar el archivo completo en el SQL Editor y repetir la prueba con dos sesiones anónimas distintas.

Decisiones aplazadas: pausa/continuación manual, final anticipado, tratamiento especial de una ausencia prolongada del anfitrión y doble apuesta.
