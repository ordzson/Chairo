---
version: 1
slug: "versiculo-o-inventiculo"
primary_target: "src/app/games/versiculo-o-inventiculo"
related_targets:
  - "src/app"
  - "src/styles.css"
  - "tests"
---

# ¿Versículo o inventículo?

Target: `src/app/games/versiculo-o-inventiculo`. Mode: Operate. Flujo multijugador mobile-first de 2 a 6 participantes.

## Aprobación

Dirección: Manual de misión. Composición del juego: **Marcador vivo**, elegida explícitamente por el usuario. Seed de la decisión: `faacbba6`. Comp aprobado: `.impeccable/mocks/decision/versiculo-marcador-vivo.png`, duplicado como referencia prioritaria en `assets/versiculo-o-inventiculo/03-pregunta-marcador-vivo.png`. No volver a pedir dirección ni generar otro concepto.

La pantalla de configuración se apoya en `assets/versiculo-o-inventiculo/01-configuracion-host.png`; las demás imágenes de esa carpeta fijan la continuidad del flujo, sin convertirse en UI rasterizada.

## Direction contract

THESIS: Una hoja de juego táctil permite preparar y conducir una partida compartida sin perder la claridad del manual Chairo.

OWN-WORLD: Papel marfil texturizado, tinta azul, encuadernación visible, notas manuscritas y piezas moldeadas amarillas, naranjas y azules; el marcador competitivo convive con una zona de lectura tranquila.

STORY: Configurar una sala en menos de un minuto, reunir de 2 a 6 personas, responder al mismo tiempo y entender con evidencia cómo se puntuó cada ronda.

FIRST VIEWPORT: En Configuración, regreso visible al centro, marca compacta, rótulo azul del juego y una única hoja con dificultad, cantidad y rol del anfitrión. El aviso de fallback precede a la acción Crear sala.

FORM: `Marcador vivo`, seed `faacbba6`, flujo comp-led. En juego, una banda azul mantiene ronda, reloj y contexto competitivo; la frase ocupa la hoja central y las dos decisiones moldeadas quedan al alcance del pulgar. En Solo anfitrión se retiran las respuestas y crece la frase.

INTERACTION: Cada selector se comporta como una pieza física del mismo sistema `.pressable`; selección, foco, pulsación, espera, bloqueo y revelación se distinguen también sin color. Movimiento reducido conserva exactamente la jerarquía final.

FINISH: Cada pantalla se implementa y verifica por separado. La revisión integral, Supabase y la documentación final pertenecen a etapas posteriores; ninguna pantalla futura se anticipa dentro de la etapa actual.

## Etapas

### 1. Configuración del anfitrión — terminada

Dificultad, cantidad, rol, aviso de fallback, volver al centro y acción Crear sala. Persistencia local verificada, 20 pruebas Playwright y revisión visual final `ship`. La pantalla no se rediseña; en la etapa 2 solo cambió la acción del botón, que ahora crea la sala y navega, con estado de creación y error.

### 2. Sala de espera del anfitrión — terminada

`#/juegos/versiculo-o-inventiculo/sala/:codigo`. Banda de estado con rol, QR escaneable con la URL definitiva de unión, código corto de cuatro caracteres sobre pincelada, lista de participantes con el anfitrión etiquetado, resumen de dificultad y cantidad, `Comenzar partida` habilitado solo con otra persona lista, `Compartir invitación` y cierre de sala.

Dominio e infraestructura mínimos: `domain/room.ts`, `domain/join-link.ts`, `domain/multiplayer.port.ts`, `infrastructure/in-memory-multiplayer.adapter.ts`, `infrastructure/room-snapshot.store.ts`, `infrastructure/qr-code.ts` y `ui/qr-code.component.ts`. El adaptador en memoria expone `joinRoom` para el invitado de la etapa 3 y sincroniza entre documentos por `storage` hasta que exista Supabase.

Estados cubiertos: creando, esperando, sala lista, sala inexistente, código imposible, reintento y fallo del portapapeles.

Límites deliberados de la etapa: no existe la pantalla de unión —el QR ya apunta a su ruta definitiva—, `Comenzar partida` confirma que la sala está lista pero no navega a la partida, y no hay banco de preguntas, puntuación ni Supabase.

Al llegar la etapa 3 se saldó la deuda de la cabecera: anillos, botón de vuelta y marca viven ahora en `ui/manual-header.component.ts`, que las tres pantallas comparten. Las capturas de configuración y sala se compararon antes y después: siete de las ocho son idénticas byte a byte y la restante difiere solo en el suavizado del rótulo, con la composición alineada al píxel.

### 3. Entrada del invitado — etapa actual

`#/juegos/versiculo-o-inventiculo/unirse/:codigo` para quien escanea el QR y `#/juegos/versiculo-o-inventiculo/unirse` para quien teclea el código. Campo de cuatro caracteres que filtra los ambiguos y explica cuál rechazó, nombre sin registro, color identificador con forma y nombre propios, y `Unirme` con estado de envío.

La sala encontrada se consulta sola en cuanto el código está completo: muestra dificultad, cantidad y colores libres, y marca como no disponibles los ya tomados. El envío no adelanta ningún veredicto: nombre repetido, color repetido, sala llena y partida empezada los decide el servidor, y cada uno dice qué pasó y qué hacer.

Dos huecos del puerto cerrados en esta etapa: `self`, el asiento de este dispositivo —`auth.uid()` en Supabase, `SeatStore` sobre `sessionStorage` en memoria— y `leaveRoom`, que retira solo el asiento propio frente a `closeRoom`, que cierra la sala entera. La sala de espera es ahora una pantalla con dos papeles: el anfitrión conserva QR, compartir, comenzar y cerrar; el invitado ve participantes, resumen y «Esperando a que el anfitrión comience», con salir de la sala.

Piezas nuevas: `ui/manual-header.component.ts`, `ui/color-mark.component.ts`, `infrastructure/seat.store.ts` y `pages/join/`.

Límites deliberados de la etapa: no hay cuenta regresiva, preguntas, revelación ni resultados; `room-started` está implementado y traducido pero solo es alcanzable contra Supabase, porque en memoria todavía no existe una partida empezada; y la lista de participantes de la sala conserva la composición aprobada en la etapa 2, sin mostrar el color de cada quien.

Hallazgo cerrado: el propietario eligió bajar el tope a 6 en lugar de ampliar el catálogo de colores. `MAX_PARTICIPANTS` ya no se escribe aparte —es `PARTICIPANT_COLORS.length`, porque hay un asiento por color— y el disparador de `supabase/schema.sql` corta en 6. Los dos techos eran uno solo, así que la entrada del invitado perdió el caso «no quedan colores libres», que con seis colores y seis asientos no podía verse nunca: una sala sin colores libres es exactamente una sala llena.

## Restricciones

- No reutilizar `.game-index`, `.game-tab` ni `.game-sheet` como composición del juego.
- Sí reutilizar tokens globales, `.pressable`, `.motion-*`, papel, anillos, marca e iconografía lineal.
- HTML/CSS semántico y responsivo desde 320 px; no usar los PNG como pantallas.
- Áreas táctiles mínimas de 48 × 48 px, foco visible, teclado, lectores de pantalla, colores forzados y movimiento reducido.
- El banco de preguntas, la partida, los resultados y el backend quedan fuera de las etapas 1 y 2.
- La presentación solo conoce `MultiplayerPort`; el adaptador de Supabase entrará por `versiculo.routes.ts` sin tocar las pantallas.
- La cabecera del manual ya es una pieza común, `ui/manual-header.component.ts`; las pantallas solo ajustan sus medidas por variables.
- Deuda siguiente: la placa azul del rótulo está escrita tres veces —`game-title` en configuración, `room-band` en la sala y `join-title` en la entrada— con los mismos siete valores de material. Conviene extraer ese material antes de una cuarta pantalla.
