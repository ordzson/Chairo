# Chairo · Centro de juegos

Centro de juegos bíblicos en español, hecho en Angular. La composición aprobada —**Manual de misión / Índice primero**— presenta los juegos como pestañas de un cuaderno físico.

Sitio publicado: **https://ordzson.github.io/Chairo/**

## Estado

- **Centro de juegos**: terminado. Índice, ficha de acetato y preferencia de modalidad guardada en el navegador.
- **¿Versículo o inventículo?**: jugable hasta la sala de espera. Configuración, sala con QR y entrada del invitado desde su propio teléfono, sincronizadas por Supabase. La cuenta regresiva, las preguntas, la revelación y los resultados llegan en etapas posteriores.
- **Jeopardy**: jugable. Tablero de 3 × 3 a 8 × 8, sala con QR para hasta cuatro jugadores —el anfitrión conduce y juzga, y solo juega si nadie más entra—, turnos, robo abierto a todos —se lo queda quien lo pide primero, y suma o resta—, dos apuestas especiales, casillas dobles y «Jugar otra vez» en la misma sala. El anfitrión puede dar diez segundos o terminar el turno cuando quiera, y ver la pregunta y la respuesta de cualquier casilla. Con Supabase la partida la arbitra la base de datos y ninguna respuesta llega a los jugadores.
- Los otros cuatro juegos: **Próximamente**.

## Ejecutar

Requiere Node 22.12+ (rama 22) o Node 24+ y pnpm.

```sh
pnpm install
pnpm start
```

Abrir http://127.0.0.1:4200.

## Compilar y verificar

```sh
pnpm build
pnpm test
pnpm check   # ambas
```

`pnpm test` son 80 pruebas de navegador con Playwright. **No tocan la red**: sirven la salida estática con Python 3 y, cuando hace falta ejercitar el adaptador remoto, contestan cada petición desde el propio Playwright. Si no hay navegador instalado:

```sh
pnpm exec playwright install chromium
```

También vale `CHROMIUM_PATH=/ruta/al/chromium pnpm test`.

Último resultado verificado (16 de septiembre de 2026): compilación correcta, 80/80 pruebas y bundle inicial de 267.40 kB (72.67 kB estimados en transferencia).

## Backend

La sala multijugador vive en Supabase. La aplicación lee la configuración en tiempo de ejecución desde `public/supabase.json`, no compilada dentro del bundle: el mismo despliegue estático puede cambiar de proyecto, o quedarse sin backend y seguir siendo jugable en un dispositivo con el adaptador en memoria.

La clave publicable viaja al navegador por definición. Lo que protege los datos son las políticas RLS de [`supabase/schema.sql`](supabase/schema.sql), que se pega entero en el SQL Editor de Supabase y es idempotente. Requiere «Allow anonymous sign-ins» activado. Cada vez que cambia —por ejemplo, al llegar las tablas de Jeopardy— hay que volver a ejecutarlo entero; hasta entonces las salas de ese juego no abren con backend.

Dos comprobaciones contra el proyecto real, fuera de la suite porque sí usan red:

```sh
node supabase/verify.mjs            # reglas y RLS por REST
node supabase/verify-navegadores.mjs # dos navegadores, dos sesiones anónimas
```

La segunda necesita la aplicación compilada y servida:

```sh
pnpm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Ambas crean filas de verdad y las borran al terminar. No las apuntes a un proyecto con partidas en curso.

## Despliegue

Cada empujón a `main` compila y publica en GitHub Pages con [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). El build usa `base-href ./` y el enrutado va por almohadilla, así que el sitio funciona bajo cualquier subruta sin reescrituras.

## Accesibilidad

Desde 320 px hasta escritorio, zoom al 200 %, movimiento reducido, colores forzados y navegación completa por teclado. Cada color identificador lleva además su propia forma y su nombre en texto: el color nunca comunica solo.

## Diseño y evidencia

- Sistema visual: [DESIGN.md](DESIGN.md), con tokens y componentes en [`.impeccable/design.json`](.impeccable/design.json).
- Producto: [PRODUCT.md](PRODUCT.md).
- Superficie del juego: [`.impeccable/surfaces/versiculo-o-inventiculo.md`](.impeccable/surfaces/versiculo-o-inventiculo.md).
- Registro de verificación, etapa a etapa: [`.impeccable/review/verification.md`](.impeccable/review/verification.md).
- Requisitos y decisión del centro: [`.impeccable/centro-de-juegos-handoff.md`](.impeccable/centro-de-juegos-handoff.md).

Las capturas de revisión y los comps aprobados no se versionan: son 104 MB de PNG que solo sirven mientras se revisa. Se regeneran ejecutando `pnpm test`, que las vuelve a escribir en `.impeccable/review/`. Los materiales de producción sí están en `assets/plates/`, con prompts y procedencia en `.impeccable/build/`.
