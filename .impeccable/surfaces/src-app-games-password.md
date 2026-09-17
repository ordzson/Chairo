---
version: 1
slug: "src-app-games-password"
primary_target: "src/app/games/password"
related_targets: ["assets/password"]
---

# Password

Target: `src/app/games/password`. Mode: Operate. Flujo móvil multiteléfono para exactamente dos participantes.

## Aprobación

Dirección aprobada por el propietario el 17 de septiembre de 2026. Autoridad visual: `assets/password/02-ficha-sujeta.png`, `05-ronda-palabra.png` y la secuencia `01-configuracion-host.png`–`08-resultado-final.png`. No abrir otra ronda ni sustituir la composición «MANÁ».

## Direction contract

THESIS: Cada teléfono funciona como una ficha física de Password: una palabra secreta domina la hoja y el resto de la interfaz solo prepara, sincroniza o registra esa ronda; se rechaza la composición de paneles genéricos.

OWN-WORLD: Papel marfil, tinta azul, marco azul moldeado, clips amarillos, pinceladas amarillas y naranjas, fichas perforadas y controles gruesos del sistema presionable de Chairo.

STORY: Dos personas crean o encuentran una sala, se preparan, levantan el teléfono, reciben palabras distintas al mismo tiempo, juegan hasta el cierre manual y confirman un punto o cero para cada palabra.

FIRST VIEWPORT: Marca Chairo compacta, placa de fase o ronda, un único tablero azul centrado con ficha marfil sujeta y una acción primaria al pie. En juego, la palabra ocupa el centro, el reloj queda en la esquina superior derecha y las dos puntuaciones permanecen debajo sin competir.

FORM: Composición «MANÁ», dirección fijada y primera autoridad del traspaso. Identificador `password-approved-2026-09-17`; la interacción distintiva es la pulsación deliberada de 600 ms cuyo progreso hunde el botón antes de cerrar la ronda.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Restricciones

Exactamente dos teléfonos y dos participantes; no hay límite de rondas, dificultad, meta de puntos, inclinación ni reconocimiento de voz. Palabras, QR, reloj, nombres, puntos y controles son DOM semántico. La palabra propia no entra al DOM antes del instante sincronizado y nunca se anuncia automáticamente. Prioridad móvil a 320 px y 390 px, con teclado, colores forzados, movimiento reducido y zoom de texto.

## Pendiente editorial

`assets/password.md` sigue vacío. La arquitectura y las pruebas pueden usar fixtures explícitos, pero la partida real queda bloqueada hasta que el propietario aporte al menos dos palabras válidas y ejecute el generador.
