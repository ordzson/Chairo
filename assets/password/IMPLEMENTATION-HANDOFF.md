# Password — traspaso para implementación

Este documento es el punto de entrada de la siguiente instancia. La dirección visual ya está aprobada; no debe abrir otra ronda de conceptos ni rediseñar la pantalla principal.

## 1. Alcance cerrado

Construir Password como nueva función Angular/Supabase de Chairo, con dos teléfonos, sala por código, palabras personalizadas por sesión, reloj sincronizado, cierre manual, puntuación manual por ronda, marcador acumulado y resultado final.

No añadir inclinación del dispositivo, reconocimiento de voz, más de dos personas, límite de rondas, meta de puntos, bonificación por tiempo, dificultad ni cuentas registradas.

## 2. Autoridad visual y activos

- North star aprobada: [`02-ficha-sujeta.png`](02-ficha-sujeta.png).
- Pantalla de ronda definitiva: [`05-ronda-palabra.png`](05-ronda-palabra.png).
- Flujo completo: `01-configuracion-host.png` a `08-resultado-final.png`.
- Cuenta 3–2–1: adaptar [`../versiculo-o-inventiculo/06-cuenta-regresiva.png`](../versiculo-o-inventiculo/06-cuenta-regresiva.png) al encabezado/ficha de Password.
- Preview del catálogo ya disponible: [`../juegos_concurso_imagenes/03_password.png`](../juegos_concurso_imagenes/03_password.png).
- Prompts originales: [`prompts/`](prompts/). Están incrustados también en los PNG.

Los mockups no se envían como fondos de pantalla. Texto, fichas, botones, QR, reloj y marcador deben ser DOM semántico y CSS. Las texturas globales existentes de papel/archivador sí pueden reutilizarse.

## 3. Estructura de archivos esperada

```text
src/app/games/password/
  domain/
    match.ts
    password.port.ts
    room.ts
    setup-config.ts
    word-bank.generated.ts
  infrastructure/
    in-memory-password.adapter.ts
    supabase-password.adapter.ts
    setup-draft.store.ts
    qr-code.ts
  pages/
    setup/
    join/
    room/
    game/
  ui/
    password-header.component.*
  password.routes.ts
scripts/generate-password-bank.mjs
tests/password-domain.spec.ts
tests/password-setup.spec.ts
tests/password-room.spec.ts
tests/password-game.spec.ts
```

No añadir dependencias. Usar exclusivamente `pnpm`, conforme a `AGENTS.md`.

## 4. Catálogo y rutas

1. Añadir `key` a `GameIcon` y dibujarlo en `GameIconComponent` siguiendo el sistema SVG existente.
2. Añadir Password al catálogo después de ¿Versículo o inventículo?: estado `available`, color disponible de la secuencia, preview `assets/juegos_concurso_imagenes/03_password.png`, ruta `/juegos/password` y entrada `/juegos/password/unirse`.
3. Registrar lazy route en `app.routes.ts`.
4. Replicar la forma de rutas de Versículo:

```text
/juegos/password
/juegos/password/unirse
/juegos/password/unirse/:codigo
/juegos/password/sala/:codigo
/juegos/password/partida/:codigo
```

El mismo `PasswordPort` debe resolver a adaptador en memoria sin configuración y a Supabase cuando exista `SUPABASE_CONFIG`.

## 5. Configuración y banco

```ts
export const ROUND_SECONDS = [30, 45, 60, 90] as const;
export const DEFAULT_ROUND_SECONDS = 60;

export interface PasswordSetup {
  readonly roundSeconds: 30 | 45 | 60 | 90;
}
```

`scripts/generate-password-bank.mjs` lee `assets/password.md`, una entrada por línea. Debe normalizar, deduplicar con `toLocaleLowerCase('es')`, validar longitud de 1–32 caracteres y fallar con un mensaje accionable si quedan menos de dos. Añadir el script como `generate:password-bank` en `package.json`; el archivo generado no lee Markdown en runtime.

## 6. Modelo de dominio

```ts
type PasswordPhase =
  | 'waiting'
  | 'preparing'
  | 'countdown'
  | 'playing'
  | 'scoring'
  | 'scoreboard'
  | 'finished';

interface PasswordPlayer {
  id: string;
  name: string;
  color: GameColor;
  role: 'host' | 'guest';
  score: number;
  ready: boolean;
}

interface RoundEntry {
  participantId: string;
  word: string;
  guessed: boolean | null;
}

interface PasswordSnapshot {
  code: RoomCode;
  phase: PasswordPhase;
  roundNumber: number;
  roundSeconds: number;
  wordVisibleAt: number | null;
  deadlineAt: number | null;
  serverNow: number;
  self: PasswordPlayer;
  players: readonly PasswordPlayer[];
  selfWord: string | null;
  revealedEntries: readonly RoundEntry[];
  roundDeltas: Readonly<Record<string, 0 | 1>>;
}
```

Invariantes:

- máximo y mínimo efectivo de dos participantes para comenzar;
- una palabra diferente por participante y ronda;
- una palabra no se repite en la partida hasta agotar la bolsa;
- `selfWord` se entrega solo a la sesión dueña durante countdown/playing;
- las dos palabras aparecen en `revealedEntries` desde scoring en adelante;
- una ronda otorga 0 o 1 punto por persona;
- solo el anfitrión muta fases globales y puntuaciones;
- guardar puntos es atómico e idempotente por número de ronda.

## 7. Estado de la partida

```text
waiting
  └─ host empieza → preparing
preparing
  └─ ambos listos → countdown (wordVisibleAt = serverNow + 3 s)
countdown
  └─ el tiempo local alcanza wordVisibleAt → playing visualmente
playing
  └─ host mantiene Terminar ronda 600 ms → scoring
scoring
  └─ host confirma ambos resultados → scoreboard
scoreboard
  ├─ host elige Otra ronda → preparing, ready=false
  └─ host elige Terminar partida → finished
finished
  └─ Jugar otra vez → waiting, puntuaciones y rondas reiniciadas
```

Llegar a `deadlineAt` no cambia la fase del servidor. La UI mantiene `playing`, muestra 0 y espera el cierre del anfitrión.

## 8. Esquema Supabase

Crear tablas propias; no reutilizar `rooms` de Versículo porque no tienen discriminador de juego.

### `password_rooms`

- `id uuid primary key`
- `code text`, índice único parcial mientras `closed_at is null`
- `host_id uuid not null`
- `round_seconds integer check in (30,45,60,90)`
- `phase text` con los siete valores del dominio
- `round_number integer not null default 0`
- `word_visible_at timestamptz null`
- `deadline_at timestamptz null`
- `created_at`, `updated_at`, `closed_at`

### `password_players`

- `id uuid primary key`
- `room_id uuid references password_rooms on delete cascade`
- `user_id uuid not null`
- `name varchar(24) not null`
- `color text not null`
- `role text check in ('host','guest')`
- `score integer not null default 0 check (score >= 0)`
- `ready boolean not null default false`
- `joined_at timestamptz`
- únicos por sala: usuario, nombre normalizado y color
- trigger que impide más de dos filas y un segundo anfitrión

### `password_rounds`

- `id uuid primary key`
- `room_id uuid`
- `round_number integer`
- `started_at`, `ended_at`, `scored_at`
- `ended_by uuid`
- único `(room_id, round_number)`

### `password_round_entries`

- `round_id uuid references password_rounds on delete cascade`
- `participant_id uuid references password_players`
- `word text not null`
- `guessed boolean null`
- primary key `(round_id, participant_id)`

Revocar lectura directa de rondas y entradas. Los clientes solo reciben instantáneas mediante funciones `security definer` con `search_path` fijado. Habilitar RLS y permisos mínimos. Publicar Realtime únicamente para `password_rooms` y `password_players`; cada mutación de ronda actualiza `password_rooms.updated_at` para despertar a ambos clientes sin transmitir palabras secretas por Realtime.

## 9. RPC requeridas

- `create_password_room(p_host_name, p_round_seconds)`
- `get_password_snapshot(p_code)`
- `join_password_room(p_code, p_name, p_color)`
- `start_password_match(p_code)`
- `set_password_ready(p_code, p_ready, p_words jsonb)`
- `end_password_round(p_code)`
- `score_password_round(p_code, p_results jsonb)`
- `prepare_password_round(p_code)`
- `finish_password_match(p_code)`
- `reopen_password_room(p_code, p_round_seconds)`
- `leave_password_room(p_code)`
- `close_password_room(p_code)`

Todas bloquean la sala `for update`, validan asiento/rol/fase y devuelven una instantánea personalizada. `set_password_ready` recibe el banco estático solo cuando hace falta abrir la ronda; cuando ambos estén listos el servidor elige dos palabras distintas que no aparezcan en rondas anteriores. Si quedan menos de dos sin usar, comienza una bolsa nueva y evita duplicar dentro de la ronda.

`score_password_round` exige exactamente una decisión booleana por participante, actualiza ambos puntajes y marca `scored_at` en una sola transacción. Una segunda llamada devuelve la instantánea actual sin volver a sumar.

## 10. Reloj y sincronización

- Calcular `clockOffset = serverNow - Date.now()` al aplicar cada snapshot.
- Derivar `remainingSeconds = max(0, ceil((deadlineAt - (Date.now() + clockOffset)) / 1000))`.
- No persistir un contador decremental ni depender de que `setInterval` se ejecute en segundo plano.
- El 3–2–1 se deriva de `wordVisibleAt`; la palabra no existe en el DOM antes de ese instante.
- Sondear como respaldo y refrescar ante eventos Realtime, siguiendo el patrón existente de Versículo.
- Al recuperar una pestaña suspendida, pedir snapshot antes de mostrar acciones de fase.

## 11. Comportamiento por pantalla

- **Setup:** nombre obligatorio, duración y Crear sala.
- **Join:** código saneado con el alfabeto existente, nombre y único color libre.
- **Room:** iniciar solo con dos jugadores; mostrar QR, código, nombres, 0 puntos y duración.
- **Preparing:** botón personal Estoy listo/a; se puede cancelar mientras el otro no esté listo.
- **Countdown:** 3–2–1 común, sin palabra en DOM ni anuncios que la revelen.
- **Playing:** una sola palabra grande, reloj de esquina, marcador compacto; host ve pulsación larga, invitado ve estado pasivo.
- **Scoring:** host elige dos resultados; Guardar puntos deshabilitado hasta completar ambos. Invitado tiene vista de espera sin controles.
- **Scoreboard:** ambos ven totales/deltas; solo host ve acciones.
- **Finished:** ganador o empate, totales y rondas; solo host reinicia sala, ambos pueden volver al centro.

## 12. Accesibilidad y dispositivo

- Teclado completo y foco visible; pulsación larga también activable manteniendo Espacio/Enter 600 ms y con alternativa accesible confirmada.
- No usar color como única señal en listo, selección o victoria.
- `aria-live` para fase, 10 segundos, 0, puntos guardados y reconexión; nunca cada tic.
- No pronunciar la palabra automáticamente.
- Solicitar Wake Lock tras el gesto de Listo y liberarlo al salir de playing.
- Soportar `prefers-reduced-motion`, zoom de texto y ancho de 320 px.
- Deshabilitar doble toque/selección accidental únicamente dentro de la ficha de palabra, no globalmente.

## 13. Pruebas obligatorias

### Dominio

- banco vacío/único/inválido, deduplicación con tildes y selección de dos distintas;
- bolsa sin repeticiones y reinicio seguro;
- transiciones válidas e inválidas;
- 0 segundos no termina la ronda;
- 0/1 punto por persona, empate y ganador;
- doble guardado no duplica puntos.

### Adaptadores

- máximo dos asientos y carreras por el segundo lugar;
- permisos de host/invitado;
- snapshot solo contiene `selfWord` durante ronda;
- reconexión en todas las fases;
- nueva ronda conserva puntos y limpia readiness;
- jugar otra vez reinicia puntos y palabras usadas.

### Playwright

Usar dos contextos de navegador para crear sala, entrar por enlace, estar listos, comprobar palabras distintas, sincronizar reloj, llegar a 0 sin avance, cerrar manualmente, asignar 1/0, ver el mismo marcador, jugar otra ronda y terminar. Añadir Axe a setup, join, room, playing, scoring y finished.

## 14. Criterios de aceptación

- Dos teléfonos reales pueden completar el flujo sin recargar ni compartir sesión.
- Ningún participante recibe la palabra del otro en su snapshot durante la ronda.
- La palabra se lee a distancia y sigue siendo el foco a 320 px y 390 px.
- El reloj nunca ocupa el centro y permanece en 0 hasta el cierre manual.
- Los puntos solo cambian al confirmar la pantalla de anotación y coinciden en ambos teléfonos.
- Una reconexión no duplica rondas ni puntajes.
- `assets/password.md` genera al menos dos palabras válidas.
- `pnpm run check` y los verificadores de Supabase terminan correctamente.
- No quedan cambios de diseño pendientes: los PNG aprobados y este documento mandan.

## 15. Orden recomendado de ejecución

1. Completar `assets/password.md`.
2. Generador y dominio puro con pruebas.
3. Adaptador en memoria y flujo Angular completo.
4. Tablas, RPC, RLS y adaptador Supabase.
5. Pruebas multicontexto y accesibilidad.
6. Comparación visual móvil contra los ocho mockups y corrección única por lote.

