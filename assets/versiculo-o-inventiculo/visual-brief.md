# ¿Versículo o inventículo? — Diseño visual y flujo

## Decisión visual

**Dirección aprobada: “Marcador vivo”.** El ritmo competitivo vive en una banda de marcador azul; la frase permanece en una hoja marfil tranquila y los dos veredictos son piezas moldeadas al alcance del pulgar. El anfitrión que también juega es el caso principal. “Solo anfitrión” usa la misma pantalla, pero elimina los controles de respuesta y amplía la frase.

Las imágenes de esta carpeta son referencias de composición, jerarquía y acabado. No deben rasterizarse como pantallas finales: texto, botones, QR, marcador y estados serán HTML accesible y responsivo.

## Job y audiencia

- Dos personas son el caso base: una crea la sala y también juega; la otra se une desde su teléfono. La estructura admite de 2 a 6 participantes sin cambiar la mecánica: hay un color identificador por asiento y el catálogo tiene seis.
- Cada participante debe leer la misma frase, elegir entre **Versículo** e **Inventículo** y entender inmediatamente cuánto ganó y por qué.
- La partida no depende de una pantalla externa. Un teléfono, tableta o pantalla grande puede actuar como anfitrión, pero cada jugador ve la pregunta y el resultado en su propio dispositivo.
- Éxito: crear una sala en menos de un minuto, unirse con QR o código, contestar sin ambigüedad y terminar una ronda sin que nadie tenga que preguntar qué hacer.

## Secuencia completa

1. **Configuración del anfitrión.** Elegir dificultad, cantidad de preguntas y rol. Valores iniciales: Media, 10 preguntas y También juego.
2. **Sala de espera.** Mostrar QR real, código corto, participantes y resumen de configuración. El anfitrión puede comenzar cuando haya al menos otra persona lista.
3. **Entrada del invitado.** Después de escanear o escribir el código: nombre, color identificador y botón Unirme. No requiere cuenta.
4. **Cuenta regresiva.** Todos reciben 3–2–1 sincronizado. El anfitrión que juega no obtiene vista previa ni ventaja.
5. **Pregunta.** Misma frase, número de ronda y tiempo restante en todos los dispositivos. Cada jugador responde una vez; su elección queda bloqueada.
6. **Espera breve.** Tras responder, los botones se sustituyen por “Respuesta enviada” y la opción elegida. No se revela la solución hasta que todos respondan o venza el tiempo.
7. **Revelación.** Veredicto, cita con su versión (RVR1960 o NTV), explicación breve, puntos y tiempo de cada participante. Avance automático visible; en modo Solo anfitrión también existe Pausar/Continuar.
8. **Resultado final.** Ganador, clasificación completa, aciertos y tiempo medio. El anfitrión puede repetir con la misma configuración o volver al centro de juegos.

## Configuración y selección de preguntas

- **Dificultad:** Fácil, Media, Difícil o Extrema.
- **Cantidad:** de 5 a 30, en pasos de 5. Predeterminado: 10.
- **Rol:** También juego o Solo anfitrión. Predeterminado: También juego.
- Se eligen primero preguntas de la dificultad configurada, sin repetir.
- Si no alcanzan, se completa de forma descendente: Extrema → Difícil → Media → Fácil. Nunca se sube a una dificultad mayor que la seleccionada.
- Antes de crear la sala se informa: “Si faltan preguntas, completaremos con niveles anteriores”. Si ni siquiera así hay suficientes, el control limita la cantidad al máximo disponible y explica el ajuste.
- No se reordena el banco para alternar Versículo/Inventículo; se conserva una secuencia aleatoria sin patrón evidente.

## Tiempo y puntos

- Tiempo base: 12 segundos; frases de más de 120 caracteres reciben 18 segundos. Todos los clientes calculan el reloj desde una marca de tiempo del servidor.
- Respuesta correcta: entre 200 y 1,000 puntos según rapidez.
- Fórmula propuesta: `200 + redondear(800 × tiempo_restante / tiempo_total)`.
- Respuesta incorrecta, sin respuesta o fuera de tiempo: 0 puntos.
- En la revelación siempre se muestran puntos y tiempo; así la diferencia entre participantes no parece arbitraria.
- Los empates permanecen como empates. La aplicación no inventa un desempate silencioso; si se desea uno, se juega una pregunta comodín.

## Jerarquía de la pantalla de pregunta

1. **Marcador compacto:** ronda, reloj y contexto competitivo. Con 2 jugadores muestra ambos; con 3–6 muestra el líder y la posición/puntuación propia.
2. **Frase:** único foco dominante, centrada en una hoja de lectura sin adornos que compitan.
3. **Decisión:** dos controles del mismo tamaño y peso visual. Amarillo para Versículo y naranja para Inventículo, acompañados siempre por texto e icono.
4. **Rol:** una nota pequeña confirma “Anfitrión · jugando” o “Solo anfitrión”.

En Solo anfitrión la zona de respuestas desaparece y la pantalla indica cuántas respuestas faltan. La primera versión avanza automáticamente; Pausar/Continuar y Terminar partida antes de tiempo quedan como decisiones de una siguiente ronda de reglas.

## Adaptación responsiva

- **320–639 px:** composición vertical en tres zonas; botones de respuesta pegados a la zona inferior de pulgar.
- **640 px o más:** marcador en una sola banda, hoja de frase más ancha y respuestas lado a lado. No se añade contenido por tener más espacio.
- **Solo anfitrión en pantalla grande:** la frase usa el espacio liberado por las respuestas; QR y código solo aparecen en la sala, nunca durante las preguntas.
- Frases largas reducen el tamaño dentro de límites definidos y después permiten desplazamiento interno; nunca empujan las respuestas fuera del viewport.

## Estados necesarios

- Creando sala, sala lista, esperando participantes y participante listo.
- Código inválido, sala inexistente, sala llena, nombre duplicado y partida ya iniciada.
- Reconectando con cuenta regresiva congelada localmente y reanudación desde el tiempo del servidor.
- Anfitrión desconectado: tolerancia breve; si no vuelve, la sala se cierra con mensaje claro.
- Respuesta disponible, respuesta bloqueada, tiempo agotado, respuesta correcta e incorrecta.
- Banco insuficiente con reducción explícita de cantidad, nunca fallo silencioso.
- Movimiento reducido, alto contraste, zoom de texto y navegación completa por teclado.

## Accesibilidad y reglas de interfaz

- Áreas táctiles mínimas de 48 × 48 px; foco visible con crema e tinta azul.
- El color nunca comunica por sí solo: etiqueta, icono y forma acompañan cada estado.
- QR acompañado siempre por código alfanumérico de cuatro caracteres sin símbolos ambiguos (`0/O`, `1/I`).
- Los cambios de ronda, tiempo restante y resultado usan anuncios `aria-live` breves, sin leer el reloj cada segundo.
- Movimiento de entrada y celebración se desactiva con `prefers-reduced-motion` sin alterar la jerarquía.
- La cita y explicación son contenido real del banco; no se inventan en la interfaz.

## Referencias visuales

- [`01-configuracion-host.png`](01-configuracion-host.png): dificultad, cantidad y rol del anfitrión.
- [`02-sala-espera.png`](02-sala-espera.png): QR, código, participantes y comienzo.
- [`03-pregunta-marcador-vivo.png`](03-pregunta-marcador-vivo.png): composición aprobada de la pregunta.
- [`04-revelacion-puntos.png`](04-revelacion-puntos.png): evidencia, puntaje y velocidad.
- [`05-resultados-finales.png`](05-resultados-finales.png): clasificación y repetición.
- [`06-cuenta-regresiva.png`](06-cuenta-regresiva.png): transición sincronizada al juego.
- [`07-respuesta-enviada.png`](07-respuesta-enviada.png): elección bloqueada mientras faltan participantes.

Los prompts exactos están en [`prompts/`](prompts/) y también se incrustan como metadatos en cada PNG.

## Límites de la primera versión

- Los PNG son referencias de diseño; la interfaz implementada sigue siendo HTML/CSS accesible y el QR se genera con la URL real de la sala.
- El modo de doble apuesta del banco queda fuera de la primera versión multiteléfono: añadir libro, fuente o detalle cambiado exigiría una segunda interacción y otra regla de puntuación.
- Pausa/continuación, final anticipado y una política especial de desconexión del anfitrión quedan para una siguiente iteración. La partida actual avanza por reloj de servidor y admite reconexión.
