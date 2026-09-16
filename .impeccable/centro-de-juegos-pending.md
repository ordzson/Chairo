# Centro de juegos · composición elegida: Índice primero

## Estado

El usuario aprobó la dirección «Manual de misión» y eligió explícitamente «Índice primero» después de ver el original y las dos variaciones. Composición definitiva: `.impeccable/mocks/manual-02-indice.png`, con `approved: true` en `.impeccable/mocks/manual-02-indice.json`. Pidió un prompt para que otra instancia construya la aplicación; no se ha iniciado código de aplicación. Continuación completa en `.impeccable/centro-de-juegos-handoff.md`.

Página de elección: http://127.0.0.1:36441/
Clave: `da7ba863`
Payload: `.impeccable/centro-de-juegos-options.json`
La respuesta ya llegó por chat; no esperar esta página ni reabrir la decisión.

1. `.impeccable/mocks/manual-01-original.png`: copia exacta del comp aprobado `.impeccable/mocks/decision/challenger-manual.png`.
2. `.impeccable/mocks/manual-02-indice.png`: seis separadores en índice vertical, luego ficha de acetato.
3. `.impeccable/mocks/manual-03-cabecera.png`: seis pestañas en dos hileras superiores, luego ficha de acetato a todo el ancho.

Cada comp tiene el prompt exacto en `.png.prompt.txt` y metadatos en `.json`. Solo Índice primero tiene `approved: true`; los otros conservan `approved: false`. Las dos variaciones se generaron con Imagegen integrado y tienen el prompt incrustado. Las tres son retratos de 941 × 1672 píxeles. Se han inspeccionado visualmente.

## Alcance confirmado

- Jeopardy, ¿Versículo o inventículo?, El discípulo más perdido, Revelaciones, Buscando perlas y Trivia son seis juegos independientes.
- Todos aparecen como «Próximamente»; las pestañas permiten explorar y focalizar, sin botón Entrar ni navegación a juegos.
- La modalidad se elige dentro de cada juego cuando exista. La principal solo permite fijar una preferencia opcional, inicialmente «Sin preferencia»; nunca bloquea.
- Preservar el manual de software de los 2000, cartulina de colores, acetato, papel y alegría.
- Angular; usar exclusivamente pnpm. Mobile-first, responsivo, accesible y navegable por teclado.
- Verificar aplicación en móvil y escritorio después de implementar.

## Correcciones conocidas de los comps

El original mezcla el subtítulo ¿Versículo o inventículo? con Jeopardy, omite su sexta pestaña, muestra Entrar y una etiqueta de modo familia. Los requisitos del usuario corrigen esos elementos al implementar, conservando la composición.

Las variaciones tienen los seis nombres y estados, pero algunos pictogramas generados no corresponden a sus juegos. Asignar bombilla a Jeopardy, interrogación a ¿Versículo o inventículo?, brújula a El discípulo más perdido, libro a Revelaciones, concha a Buscando perlas y trofeo a Trivia. El contraste oscuro sobre separadores azul/violeta del índice debe corregirse para accesibilidad. No son decisiones nuevas sobre la dirección.

## Continuación

El contexto de Impeccable ya se ejecutó. PRODUCT.md existe; aún no hay aplicación ni DESIGN.md. La autoridad visual viene de la elección explícita del usuario, sin reabrir identidad ni ejecutar otro sorteo.

Build state inicializado en fase `comps` con identificador `manual-de-mision-approved`, una referencia a la dirección fijada por el usuario, no una semilla recuperada de un sorteo anterior.

La aprobación está registrada. Continuar las fases de Impeccable con el comp elegido; no repetir la ronda. Leer craft-floor inmediatamente antes de editar UI. Al terminar: comprobar teclado, preferencia opcional y persistencia tolerante a errores, responsive y capturas móvil/escritorio, revisión independiente y documentación DESIGN.md + .impeccable/design.json.

Referencias de calidad: `.impeccable/mocks/reference/manual-board.webp`, `.impeccable/mocks/reference/manual-hero.webp`.
