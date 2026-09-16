# Prompt de continuación

/impeccable craft centro de juegos

Construye completamente el Centro de juegos de Chairo en Angular en `/home/ordson/Documentos/Christian/Chairo`.

## Decisión ya aprobada

La dirección es **Manual de misión** y la composición elegida es **Índice primero**. Ya se presentaron el original y dos variaciones, y el usuario eligió explícitamente Índice primero. No vuelvas a abrir una ronda de conceptos, generar alternativas ni pedir aprobación de esta elección. Continúa con la implementación comp-led.

- Comp definitivo: `.impeccable/mocks/manual-02-indice.png` (941 × 1672).
- Aprobación: `.impeccable/mocks/manual-02-indice.json`, con `approved: true` y la respuesta del usuario.
- Prompt de generación: `.impeccable/mocks/manual-02-indice.png.prompt.txt`.
- Referencias de calidad: `.impeccable/mocks/reference/manual-board.webp` y `.impeccable/mocks/reference/manual-hero.webp`.
- El antiguo `.impeccable/mocks/decision/challenger-manual.png` es antecedente de identidad; la composición que debes construir es **manual-02-indice.png**.

Abre las imágenes antes de trabajar. No interpretes el comp como un moodboard: conserva su estructura, materialidad, jerarquía y carácter. No conviertas la pantalla en una imagen con zonas clicables; texto y controles deben ser semánticos, responsivos y accesibles.

## Composición y conducta

Marca Chairo compacta y Centro de juegos arriba; índice de seis separadores de color apilados verticalmente; ficha del juego seleccionado sobre acetato debajo; preferencia opcional al final. Jeopardy seleccionado inicialmente.

Los seis juegos independientes, en este orden, son:
1. Jeopardy.
2. ¿Versículo o inventículo?
3. El discípulo más perdido.
4. Revelaciones.
5. Buscando perlas.
6. Trivia.

Todos deben mostrar **Próximamente**, tanto en las pestañas como en la ficha seleccionada. Se pueden explorar, focalizar y seleccionar con toque, ratón y teclado. Cambiar de pestaña actualiza la ficha sin navegar ni iniciar una partida. No incluir Entrar, Jugar, salas, cuentas ni rutas de juegos todavía. No inventar mecánicas no confirmadas; sirve el estado «Estamos preparando este juego».

La modalidad real se elegirá dentro de cada juego cuando exista. En la principal solo se fija una preferencia opcional, inicialmente **Sin preferencia**, que puede cambiarse o quitarse. Opciones acordes a PRODUCT.md: a solas, en grupo en un dispositivo y en grupo con varios teléfonos. Nada depende de esa selección. Si la guardas localmente, tolera almacenamiento bloqueado y valores inválidos. Texto de ayuda: «La modalidad se elegirá dentro de cada juego».

## Calidad visual y accesibilidad

Mantén la estética alegre de manual de software de los 2000: papel, cartulina satinada de colores, tinta azul, acetato lechoso, encuadernación y profundidad física. Produce los assets necesarios con el flujo de Impeccable; no reduzcas la materialidad aprobada a paneles planos ni sustituyas ilustraciones por CSS improvisado.

Corrige defectos del comp al traducirlo a código: contraste insuficiente en azul/violeta y pictogramas incongruentes. Usa símbolos coherentes: bombilla, interrogación, brújula, libro, concha y trofeo respectivamente. Estos ajustes conservan la composición. Prioriza lectura y objetivos táctiles en móvil; no encojas toda la maqueta como una imagen. Usa semántica de pestañas y panel, foco visible, flechas/Home/End, Tab, etiquetas de formulario y movimiento reducido.

## Estado del proyecto y continuación

PRODUCT.md existe; todavía no se ha creado la aplicación Angular ni DESIGN.md. Usa exclusivamente **pnpm** para JavaScript/TypeScript. Respeta AGENTS.md y la habilidad `.agents/skills/impeccable/SKILL.md`.

La instancia anterior ejecutó `impeccable context` y dejó `.impeccable/build/state.json` en fase `comps`; la aprobación llegó después y ya está registrada. Consulta el estado y avanza con el comp elegido, sin reiniciar la decisión. `manual-de-mision-approved` es un identificador de la dirección fijada, no una semilla de sorteo nueva. El contrato de dirección está en el surface brief de `src/app`, con copia legible en `.impeccable/centro-de-juegos-direction.md`.

Lee craft-floor inmediatamente antes de editar UI. Sigue las fases de medición del comp, producción de assets, implementación, responsive y revisión de Impeccable. Si el lector de aprobación exige otro formato de sidecar, adapta los metadatos conservando esta aprobación explícita; no la solicites de nuevo. No necesitas la antigua página local de elección.

Usa Angular con arquitectura sencilla, sin backend para esta pantalla. Conserva compatibilidad de despliegue estático en GitHub Pages y futura integración con Supabase; no despliegues ni configures servicios externos ahora.

## Finalización

Verifica en navegador a 390 px y 1440 px, comprueba desbordamientos a 320 px y 1280 px, títulos largos, contraste, navegación de teclado, cambio de ficha, estado Próximamente y preferencia no bloqueante. Guarda capturas en `.impeccable/review/mobile.png` y `.impeccable/review/desktop.png`. Ejecuta la compilación y las comprobaciones pertinentes con pnpm. Completa revisión y documentación de Impeccable, incluidos DESIGN.md y `.impeccable/design.json`, y entrega instrucciones para ejecutar la app y resultados de las verificaciones. No termines con un plan: construye y verifica.
