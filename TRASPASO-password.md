# Traspaso — implementar Password

Implementa el juego Password completo siguiendo, en este orden:

1. [`assets/password/IMPLEMENTATION-HANDOFF.md`](assets/password/IMPLEMENTATION-HANDOFF.md): contrato funcional y técnico vinculante.
2. [`assets/password/visual-brief.md`](assets/password/visual-brief.md): flujo UX, accesibilidad y referencias visuales.
3. [`assets/password/02-ficha-sujeta.png`](assets/password/02-ficha-sujeta.png): dirección visual aprobada por el propietario.
4. `assets/password/01-configuracion-host.png` a `08-resultado-final.png`: estados que deben reproducirse con HTML/CSS, no como fondos rasterizados.

No abras otra ronda de diseño. La composición “MANÁ”, la sala de dos personas y el recuento manual de un punto por palabra ya están aprobados.

## Bloqueo previo

`assets/password.md` está vacío. Complétalo con una palabra o frase por línea antes de ejecutar el generador. No inventes contenido bíblico silenciosamente: si el banco sigue vacío, pide al propietario las palabras.

## Definición de terminado

- Flujo completo en adaptador en memoria y Supabase.
- Dos sesiones reales sincronizadas.
- Puntos atómicos e idempotentes.
- Reloj en 0 hasta cierre manual.
- Estados responsivos y accesibles comparados con los ocho mockups.
- `pnpm run check` y verificadores de Supabase aprobados.

## Estado (17 de septiembre de 2026)

Terminado y unificado: Password **es** Revelaciones en el índice del centro de juegos. La ficha «Password» separada
desapareció; la entrada `revelaciones` ya está `available`, con icono de llave y rutas `/juegos/revelaciones`,
`/juegos/revelaciones/unirse`, `/juegos/revelaciones/sala/:codigo` y `/juegos/revelaciones/partida/:codigo`.
El código sigue viviendo en `src/app/games/password/` y las tablas siguen llamándose `password_*`.

- `assets/password.md` tiene 171 palabras y frases bíblicas; `pnpm run generate:password-bank` las compila.
- `pnpm run check` termina en verde: compilación y 100/100 pruebas.
- El esquema se aplicó dos veces seguidas sobre `supabase/postgres:17.6.1.141` en un contenedor desechable:
  es idempotente y el recorrido completo de RPC pasa. Ahí apareció y se corrigió un error real: en
  `set_password_ready` el candidato de la bolsa se llamaba `word`, igual que `password_round_entries.word`, así que
  la subconsulta se comparaba consigo misma y la segunda ronda repetía palabras.

Falta un solo paso manual: pegar `supabase/schema.sql` entero en el SQL Editor del proyecto remoto y después
ejecutar `pnpm run verify:supabase:password`.
