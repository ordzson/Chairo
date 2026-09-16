# Traspaso · Cerrar la verificación remota de la etapa 3

Proyecto: `/home/ordson/Documentos/Christian/Chairo` — «¿Versículo o inventículo?», Angular + Supabase.
Usa **pnpm**, nunca npm ni npx. Lee antes de editar: `.impeccable/surfaces/versiculo-o-inventiculo.md`,
`.impeccable/review/verification.md`, `supabase/schema.sql` y `src/app/games/versiculo-o-inventiculo/` completo.
Usa la skill impeccable (`.agents/skills/impeccable/scripts/impeccable context --target src/app/games/versiculo-o-inventiculo`).

## Estado

Etapas 1, 2 y 3 terminadas, veredicto visual `ship` en las tres. `pnpm run build` aprobado y
`pnpm test` en 54/54 sin red. La dirección visual está aprobada («Marcador vivo», seed `faacbba6`):
no propongas otra ni rediseñes ninguna pantalla existente.

El acceso anónimo de Supabase **ya está activo**. `node supabase/verify.mjs` corre y pasa doce de
catorce comprobaciones. Este traspaso es solo para cerrar lo que falta. **No implementes cuenta
regresiva, preguntas, revelación ni resultados.**

## 1. La base remota no corre el `schema.sql` del repositorio — arréglalo primero

Bloquea todo lo demás. Síntoma medido contra el proyecto real, con el token del anfitrión:

| Escritura sobre `rooms` por el anfitrión | Resultado |
|---|---|
| `status = 'playing'` | 204 |
| `started_at = <fecha>` | 204 |
| `closed_at = null` | 200 |
| `closed_at = <fecha>` | **403 `new row violates row-level security policy for table "rooms"`** |
| `DELETE` de la sala | 200, 1 fila |

Un 403 con código `42501` es un fallo de `WITH CHECK`, no de permisos. Que `closed_at = null` pase y
`closed_at = <fecha>` no, significa que la política viva de actualización exige `closed_at is null`
también en su `WITH CHECK`. El `supabase/schema.sql` del repositorio **no** tiene esa condición, así
que la base remota quedó con una versión anterior.

Consecuencia: **`closeRoom` no funciona en producción**. El anfitrión no puede cerrar la sala, su
código sigue reservado por el índice `rooms_open_code_key`, y como el adaptador no comprueba el error
de esa escritura, la pantalla vuelve a la configuración como si hubiera ido bien.

### Qué hacer

Primero mira qué hay de verdad, en el SQL Editor de Supabase:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('rooms', 'participants')
order by tablename, policyname;
```

Si aparece una política de `UPDATE` sobre `rooms` cuyo `with_check` menciona `closed_at`, ese es el
problema. Si se llama `rooms_update_host`, basta con volver a aplicar `supabase/schema.sql` entero,
que es idempotente. Si tiene **otro nombre**, `drop policy if exists "rooms_update_host"` no la toca:
bórrala por su nombre real y después aplica el archivo.

El estado correcto, que ya está en el repositorio, es este:

```sql
drop policy if exists "rooms_update_host" on public.rooms;
create policy "rooms_update_host" on public.rooms
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());
```

Comprueba la corrección volviendo a correr `node supabase/verify.mjs`: las catorce deben pasar.

Aprovecha para revisar si el resto del esquema vivo coincide con el archivo, porque si esta política
quedó vieja puede haber más. `create table if not exists` no actualiza columnas ya creadas, así que
una diferencia de columnas o de disparador no se arregla volviendo a aplicar el archivo.

## 2. `closeRoom` se traga el error de la escritura

Independiente del esquema: una escritura puede fallar por red, por RLS o porque la sala ya no existe,
y hoy nada de eso se nota.

En `infrastructure/supabase-multiplayer.adapter.ts`, `closeRoom` hace el `update` y no mira `error`.
Haz que un fallo se propague como `MultiplayerError` y que `room.page.ts` lo muestre sin abandonar la
sala, con el mismo tono de las demás recuperaciones: qué pasó y qué hacer. Hoy `exitRoom()` navega
pase lo que pase. El adaptador en memoria no puede fallar ahí, así que para cubrirlo con Playwright
sin meter red te hará falta un doble del puerto o un adaptador en memoria que sepa fallar a petición;
decide tú, pero **conserva el patrón de `tests/offline.ts`: la suite no toca la red**.

## 3. `MAX_PARTICIPANTS` son 8, pero la sala solo admite 6 — decisión del propietario

Confirmado con datos contra el proyecto real: con cinco asientos ocupados, el siguiente rebota con
`participants_room_color_key`, nunca con el `room-full` del disparador. Los colores identificadores
son seis y únicos por sala, y el anfitrión ocupa el amarillo, así que el techo real son seis asientos.
`room-full` es inalcanzable en producción.

**No lo decidas tú.** Pregunta al propietario y aplica una de las dos:

- **Bajar el tope a 6**: `MAX_PARTICIPANTS` en `domain/room.ts` y el `if taken >= 8` de
  `guard_participant_insert()` en `supabase/schema.sql`. Entrega el SQL para aplicar y no des por
  hecho que ya corre en el proyecto remoto. Revisa `isRoomFull()`, que gobierna el hueco
  «Esperando…» de la sala, y el texto «de 2 a 8» de `PRODUCT.md`, `DESIGN.md` y el brief.
- **Ampliar el catálogo de colores** hasta ocho: toca `GameColor` en `src/app/game.ts`, el `check`
  de `color` en el esquema, `PARTICIPANT_COLORS` en `domain/room.ts` y `ui/color-mark.component.ts`,
  donde cada color necesita **su propia forma**; el color nunca comunica solo. Dos colores nuevos son
  una decisión de sistema visual, no un detalle: pasa por la skill impeccable.

La entrada del invitado ya distingue los dos techos —«sala llena» y «no quedan colores libres»— así
que la interfaz aguanta cualquiera de las dos salidas sin rehacerse.

## 4. `supabase/verify.mjs` comprueba dos cosas por la razón equivocada

- Reutiliza el token del mismo invitado para pedir nombre y color repetidos. Lo que rebota es
  `participants_room_user_key` —un asiento por dispositivo— y no los índices de nombre y color. Con
  sesiones anónimas distintas sí devuelven `participants_room_name_key` y
  `participants_room_color_key`, que son los que traduce `joinError()`.
- Su bucle de sala llena repite cuatro colores para seis invitados, así que la mayoría de las altas
  fallan en silencio y la sala nunca se acerca a ocho. Por eso «la sala se llena hasta ocho como
  máximo» pasaba mostrando 6 asientos.

Arregla el guion para que cada alta use una sesión nueva y un color libre, y que el caso de sala
llena dependa de lo que decidas en el punto 3.

## 5. Prueba a mano con dos navegadores — hazla al final

Solo tiene sentido con el esquema ya alineado. `public/supabase.json` ya apunta al proyecto.

1. `pnpm run build` y sirve `dist/chairo/browser` (la suite usa
   `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist` y la base
   `http://127.0.0.1:4173/chairo/browser/`).
2. Navegador A: crea la sala. Navegador B, **en otro perfil o ventana privada** para que tenga su
   propia sesión anónima: entra por `#/juegos/versiculo-o-inventiculo/unirse/<código>`.
3. Comprueba que el invitado aparece en A sin recargar, que B ve «Esperando a que el anfitrión
   comience» y ninguno de los mandos del anfitrión, que recargar B no lo expulsa, que «Salir de la
   sala» retira solo su asiento, y que «Cerrar sala» en A sí cierra la sala.
4. Prueba el escaneo real del QR con un teléfono si puedes: es el camino por el que llegará casi todo
   el mundo.

Anota el resultado en `.impeccable/review/verification.md`, bajo la etapa 3, y actualiza
`.impeccable/surfaces/versiculo-o-inventiculo.md` si algo cambia de estado.

## Límites

No toques la composición aprobada de las tres pantallas. No metas red en la suite de Playwright. El
aviso de presupuesto inicial (264.80 kB frente a 250 kB) es anterior: no lo persigas, solo no lo
empeores. Al terminar, ejecuta `pnpm run build`, `pnpm test`, el detector de impeccable sobre los
archivos tocados y `node supabase/verify.mjs`.

## Residuo de las comprobaciones

Las pruebas contra el proyecto real dejaron una sala abierta con el código `8RBP`, creada por una
sesión anónima efímera cuyo token ya no existe. Ningún otro dispositivo puede cerrarla, porque
`rooms_update_host` solo deja al anfitrión, así que mantiene su código reservado por el índice
`rooms_open_code_key`. Ciérrala desde el SQL Editor:

```sql
update public.rooms set closed_at = now() where code = '8RBP' and closed_at is null;
```

Evita `select public.close_stale_rooms('0 seconds')` para esto: es `security definer` y cerraría
todas las salas abiertas, no solo la sobrante.
