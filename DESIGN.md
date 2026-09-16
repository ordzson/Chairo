---
name: Chairo
description: Un archivador juvenil y táctil que convierte el catálogo de juegos bíblicos en un manual de misión vivo.
colors:
  mission-ink: "#07266e"
  ink-deep: "#031b56"
  binder-field: "#061d5c"
  binder-spine: "#082b7d"
  paper: "#f3eadb"
  paper-light: "#fff8e9"
  joy-yellow: "#ffc61b"
  chapter-orange: "#f36b22"
  chapter-turquoise: "#20b9b9"
  chapter-blue: "#2775d9"
  chapter-green: "#54bd53"
  chapter-violet: "#8262ce"
  focus-cream: "#fff8cf"
  pure-white: "#ffffff"
typography:
  display:
    fontFamily: "Lilita One, Cabin Condensed, sans-serif"
    fontSize: "clamp(2rem, 5.8vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Cabin Condensed, sans-serif"
    fontSize: "clamp(1.15rem, 4.7vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Cabin Condensed, sans-serif"
    fontSize: "clamp(1rem, 2.6vw, 1.55rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  status:
    fontFamily: "Dosis, sans-serif"
    fontSize: "clamp(0.9rem, 3vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  handwritten-title:
    fontFamily: "Kalam, cursive"
    fontSize: "clamp(1.65rem, 3.8vw, 2.35rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.025em"
  handwritten-note:
    fontFamily: "Kalam, cursive"
    fontSize: "clamp(0.8rem, 2.2vw, 1.35rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "normal"
rounded:
  manual-frame: "clamp(0px, 2.2vw, 22px)"
  chapter-tab: "0 clamp(18px, 3vw, 30px) clamp(18px, 3vw, 30px) 0"
  acetate-sheet: "clamp(16px, 2.8vw, 28px)"
  paper-card: "16px"
  field: "12px"
  skip-link: "0 0 10px 10px"
spacing:
  index-gap: "8px"
  compact: "8px"
  control: "12px"
  section: "24px"
components:
  mission-manual:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.manual-frame}"
    padding: "clamp(18px, 4.1vw, 40px) clamp(12px, 2.7vw, 26px) clamp(18px, 3.6vw, 36px) clamp(18px, 5.8vw, 57px)"
  game-tab-yellow:
    backgroundColor: "{colors.joy-yellow}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.chapter-tab}"
    padding: "0 clamp(13px, 2.6vw, 25px)"
    height: "clamp(76px, 10.7vw, 104px)"
  game-tab-orange:
    backgroundColor: "{colors.chapter-orange}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.chapter-tab}"
    padding: "0 clamp(13px, 2.6vw, 25px)"
    height: "clamp(76px, 10.7vw, 104px)"
  game-tab-turquoise:
    backgroundColor: "{colors.chapter-turquoise}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.chapter-tab}"
    padding: "0 clamp(13px, 2.6vw, 25px)"
    height: "clamp(76px, 10.7vw, 104px)"
  game-tab-blue:
    backgroundColor: "{colors.chapter-blue}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.chapter-tab}"
    padding: "0 clamp(13px, 2.6vw, 25px)"
    height: "clamp(76px, 10.7vw, 104px)"
  game-tab-green:
    backgroundColor: "{colors.chapter-green}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.chapter-tab}"
    padding: "0 clamp(13px, 2.6vw, 25px)"
    height: "clamp(76px, 10.7vw, 104px)"
  game-tab-violet:
    backgroundColor: "{colors.chapter-violet}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.chapter-tab}"
    padding: "0 clamp(13px, 2.6vw, 25px)"
    height: "clamp(76px, 10.7vw, 104px)"
  game-sheet:
    backgroundColor: "rgb(245 246 239 / 0.72)"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.acetate-sheet}"
    padding: "clamp(30px, 5.2vw, 50px) clamp(14px, 4vw, 38px) clamp(20px, 3vw, 30px)"
  preference-sheet:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.paper-card}"
    padding: "clamp(24px, 3.4vw, 34px) clamp(20px, 3.6vw, 36px) clamp(22px, 3.4vw, 34px) clamp(42px, 6vw, 58px)"
  preference-select:
    backgroundColor: "rgb(255 249 232 / 0.78)"
    textColor: "{colors.mission-ink}"
    rounded: "{rounded.field}"
    padding: "0.7rem 3.1rem 0.7rem 1rem"
    height: "64px"
  skip-link:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.pure-white}"
    rounded: "{rounded.skip-link}"
    padding: "0.75rem 1rem"
---

# Design System: Chairo

## Overview

**Creative North Star: "El archivador de misión vivo"**

Chairo se siente como un manual juvenil que alguien sigue usando: papel marfil con fibra visible, tinta azul, lomo y herrajes de archivador, separadores de capítulos intensos, acetato lechoso y marcas pintadas a mano. La materia física organiza la interfaz; no es decoración aplicada sobre una estructura de aplicación genérica.

La voz combina la energía optimista de software educativo de los años 2000 con lectura inmediata para todas las edades. El índice conduce la exploración, el capítulo activo se adelanta y una ficha transparente revela el contenido asociado; cada efecto digital debe reforzar esa ilusión táctil y seguir siendo claro con teclado, movimiento reducido y colores forzados.

**Key Characteristics:**

- Archivador azul marino centrado que enmarca una hoja física.
- Índice vertical de capítulos saturados como navegación primaria.
- Capas de papel, acetato, metal y pintura con profundidad estructural.
- Tinta azul como voz unificadora sobre todas las superficies.
- Cuatro voces tipográficas con funciones distintas y estables.
- Reflujo móvil compacto que conserva el orden y el carácter material.

## Colors

La paleta enfrenta una tinta azul constante con papel cálido y una secuencia alegre de colores de capítulo; el color ordena contenido, no decora contenedores intercambiables.

### Primary

- **Tinta de misión** (`colors.mission-ink`): texto, iconos lineales, divisores y bordes de control; mantiene una sola voz sobre papel y pestañas.
- **Amarillo alegría** (`colors.joy-yellow`): marca, subrayados pintados, primer capítulo y acentos de atención.
- **Azul profundo** (`colors.ink-deep`): fondos de acceso y refuerzo oscuro de la tinta.

### Secondary

- **Naranja capítulo** (`colors.chapter-orange`): segundo separador del índice.
- **Turquesa capítulo** (`colors.chapter-turquoise`): tercer separador del índice.
- **Azul capítulo** (`colors.chapter-blue`): cuarto separador del índice, deliberadamente más luminoso que el campo del archivador.

### Tertiary

- **Verde capítulo** (`colors.chapter-green`): quinto separador del índice.
- **Violeta capítulo** (`colors.chapter-violet`): sexto separador del índice.

### Neutral

- **Campo del archivador** (`colors.binder-field`): fondo de página que hace visible la silueta del manual en pantallas anchas.
- **Lomo azul** (`colors.binder-spine`): franja estructural detrás de la hoja y los anillos.
- **Papel marfil** (`colors.paper`): cuerpo principal del manual.
- **Papel claro** (`colors.paper-light`): hoja de preferencia y controles cálidos.
- **Crema de foco** (`colors.focus-cream`): primera línea del anillo de foco de alto contraste.
- **Blanco puro** (`colors.pure-white`): relieve de títulos seleccionados y texto excepcional sobre azul oscuro.

### Named Rules

**The Ink-on-Material Rule.** La tinta de misión conserva texto, contornos e iconografía; los colores de capítulo cambian la materia de fondo, no la voz.

**The Chapter Sequence Rule.** Amarillo, naranja, turquesa, azul, verde y violeta forman un orden reconocible; no se intercambian arbitrariamente ni se convierten en estados de éxito, alerta o error.

## Typography

**Display Font:** Lilita One (con Cabin Condensed como respaldo)

**Body Font:** Cabin Condensed (con sans-serif como respaldo)

**Status Font:** Dosis (con sans-serif como respaldo)

**Handwritten Font:** Kalam (con cursive como respaldo)

**Character:** Lilita One hace que los títulos activos parezcan rotulados; Cabin Condensed concentra nombres y lectura útil; Dosis etiqueta estados con ligereza; Kalam aporta las anotaciones humanas del manual. Las voces no se mezclan por gusto: cada una representa una capa distinta del objeto.

### Hierarchy

- **Display** (`typography.display`): nombre del juego seleccionado en la ficha y título adelantado de la pestaña activa, con relieve blanco dibujado.
- **Headline** (`typography.headline`): nombres de juego en el índice; fuerte, condensado y capaz de envolver en anchos estrechos.
- **Body** (`typography.body`): ayudas, selección de modalidad y texto explicativo.
- **Status** (`typography.status`): “Próximamente” dentro de las pestañas y mensajes de preparación.
- **Handwritten Title** (`typography.handwritten-title`): subtítulo de marca “Centro de juegos”.
- **Handwritten Note** (`typography.handwritten-note`): notas de margen, etiquetas inclinadas y comentarios de autor.

### Named Rules

**The Voice Assignment Rule.** Lilita One rotula lo seleccionado, Cabin Condensed informa, Dosis etiqueta y Kalam anota; una nueva pantalla debe respetar esa división antes de ajustar tamaño o peso.

## Layout

El lienzo admite desde 320 px y, en escritorio, coloca un único manual centrado con ancho máximo de 980 px sobre el campo azul. El marco recibe aire exterior fluido (`clamp(0px, 2vw, 24px)`) y una sangría interior asimétrica que reserva espacio al lomo; el encabezado usa tres columnas para equilibrar marca y notas manuscritas.

El contenido sigue una secuencia vertical inequívoca: marca, índice de seis capítulos, ficha activa y hoja de preferencia. Las pestañas en reposo dejan visible la encuadernación; la pestaña activa ocupa el ancho completo y se adelanta. La ficha y la preferencia no compiten con el índice: explican la selección actual y una opción global, respectivamente.

A 640 px o menos, el campo exterior desaparece, el manual pasa de borde a borde, las notas laterales se ocultan y cada pestaña se reorganiza en icono más dos filas de texto. La ficha y su encabezado se compactan en dos columnas, y la hoja de preferencia conserva icono y campo sin la nota final. Por debajo de 350 px se reducen sangrías y salientes, pero nunca se cambia el orden de lectura.

**The Centered Binder Rule.** En pantallas amplias existe un solo objeto central; no se reparte el catálogo en una cuadrícula de paneles ni se estira el papel hasta llenar todo el viewport.

## Elevation & Depth

La profundidad es física y jerárquica. El manual proyecta una sombra ambiental amplia sobre el campo azul; el lomo tiene oscuridad interior y un pequeño desplazamiento lateral; las piezas presionables tienen grosor propio y descansan sobre su canto; el acetato combina transparencia, brillo interior, borde claro y desenfoque únicamente para parecer plástico. La hoja inferior vuelve a papel y usa una sombra cálida más discreta.

### Shadow Vocabulary

- **Manual elevado** (`0 18px 34px rgb(2 19 63 / 0.3)`): separa el archivador completo del campo azul.
- **Canto presionable** (tres capas sólidas a `0.3 ×`, `1 ×` y `1.14 × var(--press-offset)`): el grosor de la pieza, cortado de su propio color en tres tonos —tira iluminada bajo la cara, cuerpo del canto y base en sombra— para que lea como pared moldeada y no como caída plana. Lo acompañan dos sombras de apoyo, una corta y contacta y otra ambiental.
- **Pestaña en reposo** (`--press-depth` 6 px, 5 px en móvil): cartulina gruesa dentro del índice.
- **Pestaña seleccionada** (`--press-depth` 10 px): el capítulo abierto es la pieza más gruesa de la pila.
- **Acetato** (`0 10px 22px rgb(3 26 80 / 0.23)`): profundidad exterior acompañada por brillos interiores, reservada a la ficha de vista previa.
- **Hoja de preferencia** (`0 8px 16px rgb(63 40 3 / 0.16)`): elevación cálida y baja sobre el papel principal.

### Named Rules

### Press System

Un solo primitivo, `.pressable`, da grosor y acabado a cualquier control del manual: una cara de plástico moldeado iluminada desde arriba, apoyada sobre una pared lateral cortada de su mismo color (`color-mix` con la tinta profunda).

- **Tokens por pieza:** `--press-face` (color de la cara), `--press-depth` (grosor) y `--press-lift` (cuánto se levanta). El resto —los tres tonos del canto, el acabado y todas las sombras— se deriva.
- **Pared:** `--press-edge-lit`, `--press-edge` y `--press-edge-base` mezclan la cara con la tinta profunda al 74 %, 52 % y 33 %. Los tres se apilan proporcionalmente a `--press-offset`, así la pared se moldea igual con 4 px que con 10 px y desaparece entera al pulsar.
- **Volumen de la cara:** sombras interiores que describen una sola pieza curvada —labio iluminado arriba, cantos rodados a los lados, panza en sombra abajo—. Son locales al borde, nunca oscurecen el centro donde vive el texto.
- **Acabado (`--press-gloss`):** dos degradados sobre la cara, una veta especular diagonal y una corona que se apaga en la cintura. El blanco se mantiene bajo a propósito para no lavar la paleta ni bajar el contraste de la tinta.
- **Aplicación del acabado:** `.pressable:not(select)::after` lo pinta como capa propia, heredando el radio de la pieza. Los widgets reemplazados ignoran los pseudoelementos, así que `select` usa el mismo token como `background-image`.
- **Reposo:** la cara flota a `--press-depth` sobre su canto.
- **Hover y foco:** la pieza sube `--press-lift`, el canto crece lo mismo —así el apoyo no se mueve— y el acabado gana luz (`saturate(1.07) brightness(1.03)`), como un objeto que gira hacia la luz.
- **Pulsado:** el canto se reduce a cero, la cara baja hasta la página, se aplasta un 1,5 % en vertical y pierde brillo, en `--motion-instant`.
- **Reutilización:** un control nuevo solo añade la clase y declara su `--press-face`; nunca copia sombras, degradados ni filtros a mano.
- **Composición:** el levantamiento usa `translate` y `scale`, no `transform`, porque `transform` pertenece a las animaciones de entrada.

**The Structural Depth Rule.** Cada sombra debe explicar una relación entre piezas físicas; el desenfoque translúcido pertenece al acetato y no se reutiliza como glassmorphism genérico.

**The One Press Rule.** Todo lo que se puede pulsar comparte el mismo primitivo de grosor y acabado; una pieza ajusta cara, grosor y elevación, pero no inventa otra física ni se pinta su propio brillo.

## Shapes

Las siluetas siguen la lógica de papelería encuadernada. El manual tiene esquinas amplias en escritorio y se vuelve recto contra el viewport móvil. Las pestañas nacen planas desde el lomo y redondean solo el extremo derecho (`rounded.chapter-tab`); la ficha de acetato usa un radio amplio (`rounded.acetate-sheet`), mientras que hoja y campo usan radios menores (`rounded.paper-card` y `rounded.field`). Una costura discontinua interior, agujeros circulares y anillos metálicos hacen visible cómo se construye el objeto.

Las marcas pintadas no deben convertirse en cápsulas perfectas. Subrayados, pinceladas y etiquetas admiten inclinación y bordes irregulares; los controles de interacción mantienen contornos limpios para no perder precisión.

**The Tactile Shape Rule.** Antes de redondear una pieza, identifica su material y su unión: pestaña, papel, acetato, metal y pintura no comparten una silueta genérica.

## Motion

El movimiento cuenta cómo se abre un manual: la tapa aparece, el título se rotula, los capítulos caen desde el lomo y la ficha se apoya encima. Nada entra desde una dirección arbitraria; cada pieza se mueve por donde está unida al objeto.

### Tokens

- **Duraciones:** `--motion-instant` 90 ms, `--motion-fast` 160 ms (hover y estados), `--motion-medium` 280 ms (cambios de geometría), `--motion-slow` 460 ms, `--motion-entrance` 620 ms (entradas), `--motion-idle` 7 s (deriva continua).
- **Curvas:** `--ease-settle` para material que se posa, `--ease-snap` para cartulina y sellos que rebotan levemente, `--ease-standard` para lo demás.
- **Escalonado:** `--motion-step` 55 ms entre hermanos; el contenedor fija `--motion-stagger-base`.

### Motions

Cinco gestos reutilizables, declarados en el marcado como `.motion-*`; el CSS de cada pieza solo ajusta cuándo ocurren.

- **`.motion-rise`** — opacidad más ascenso de `--motion-distance`; entrada por defecto de papel y texto.
- **`.motion-slide-in`** — entra desde la izquierda, como una pestaña que nace del lomo.
- **`.motion-stamp`** — escala y enderezado de una marca impresa: placa de marca y estado manuscrito.
- **`.motion-draw`** — `scaleX` desde el borde izquierdo, para trazos pintados como el subrayado del título.
- **`.motion-pop`** — realce corto de un icono al seleccionarse un capítulo.
- **`.motion-float`** — deriva vertical lenta e infinita, reservada al arte de escenario.

Los ajustes por pieza (`--motion-delay`, `--motion-duration`, `--motion-distance`, `--motion-rest`, `--motion-tilt`) se declaran con `@property` sin herencia, de modo que afinar un contenedor nunca contamina a sus hijos. `--motion-rest` conserva la inclinación en reposo de la pieza para que la animación componga con ella en lugar de borrarla.

### Behavior

- **Entrada de página:** manual, marca, título, trazo, notas, anillos, capítulos escalonados, ficha y hoja de preferencia, en ese orden, en torno a 1.2 s en total.
- **Cambio de capítulo:** el contenido de la ficha se recrea con `@for` sobre el juego seleccionado, así su entrada vuelve a ejecutarse; la pestaña activa desplaza ancho y sangría con `--motion-medium`.
- **Hover:** la pestaña se levanta `--press-lift` sobre su canto y el icono del capítulo se levanta y gira levemente; el ancho y la sangría no cambian.
- **Reducción de movimiento:** duraciones, retardos y repeticiones se anulan; toda entrada termina exactamente en el estado de reposo, así la página sin movimiento es idéntica a la página ya asentada.

**The Bound Motion Rule.** Una pieza solo se mueve desde su unión física y vuelve a su reposo; no hay entradas decorativas, ni paralaje, ni movimiento que la interacción no explique.

## Components

### Chapter Tabs (Buttons)

Las pestañas son la navegación principal y deben sentirse como cartulina presionable, no como tarjetas de un dashboard.

- **Shape:** borde de tinta de 2 px, origen plano junto al lomo y extremo derecho redondeado (`rounded.chapter-tab`).
- **Color:** una variante por capítulo (`components.game-tab-yellow` a `components.game-tab-violet`) con tinta de misión constante.
- **Selected:** ocupa el ancho completo, abandona la sangría izquierda y usa Lilita One con relieve blanco para el nombre.
- **Depth:** usa el primitivo `.pressable` con la cara del capítulo (`--press-face: var(--tab-color)`); el índice separa 8 px para que el canto de cada pestaña quede a la vista. Grosor, acabado y brillo de hover vienen íntegros del primitivo: la pestaña no declara ninguna sombra ni degradado propio.
- **Hover:** sube sobre su canto y gana luz por el primitivo; no cambia ancho ni sangría.
- **Pressed:** se hunde hasta apoyarse en la página, el gesto táctil que justifica el grosor.
- **Focus:** combina crema visible, tinta exterior y el canto de la pieza debajo del anillo; en colores forzados cede a `Highlight`.
- **Keyboard:** tablist vertical con foco itinerante; flechas arriba/abajo recorren, Inicio y Fin saltan a los extremos.

### Game Preview Sheet

La ficha activa es una lámina de acetato enfocada y legible que funciona como `tabpanel`.

- **Surface:** base lechosa translúcida, borde blanco, brillo interior y desenfoque de 3 px limitado a esta pieza.
- **Heading:** icono lineal, nombre rotulado sobre una pincelada amarilla y estado manuscrito inclinado.
- **Content:** arte de escenario de borde pintado y un mensaje de preparación centrado; el contenido cambia con la pestaña seleccionada.
- **Focus:** recibe el mismo anillo seguro que pestañas y campo de selección.

### Preference Paper and Select

La preferencia vive en una hoja independiente con perforaciones visibles; es opcional y nunca parece un paso de bloqueo.

- **Sheet:** papel claro (`components.preference-sheet`) con sombra cálida, icono de engranaje y nota manuscrita en escritorio.
- **Field:** fondo marfil semitransparente, borde de tinta de 2 px, altura mínima de 64 px y chevrón SVG propio (`components.preference-select`).
- **Depth:** reutiliza `.pressable` con un canto discreto (`--press-depth` 4 px, `--press-lift` 2 px); es un campo, no una pestaña, y su grosor queda por debajo del índice. Al ser un widget reemplazado, recibe `--press-gloss` como `background-image` sobre su marfil en lugar de la capa `::after`.
- **Responsive:** pasa de tres columnas a icono más contenido a 640 px; la nota final se oculta antes que el campo.
- **Behavior:** la selección persiste, puede volver a “Sin preferencia” y no inicia una partida.

### Mission Manual Frame

El contenedor principal es una hoja texturizada con borde cálido, costura interior discontinua y lomo azul en el borde izquierdo. En escritorio está elevado y centrado; en móvil toca ambos bordes y elimina radios laterales.

### Game Icons

Los pictogramas son SVG lineales de 64 × 64, sin relleno, con trazo de 3.2, terminales redondos y la tinta heredada del contexto. Conservan una familia común aunque representen bombilla, pregunta, brújula, libro, concha, trofeo o engranaje; no se sustituyen por emoji ni glifos Unicode.

### Skip Link

El acceso “Ir a los juegos” permanece fuera de pantalla hasta recibir foco. Entonces entra desde el borde superior como una pestaña azul profunda, con texto blanco y borde amarillo; dirige el foco a la pestaña seleccionada.

## Do's and Don'ts

### Do:

- **Do** construye cada superficie desde un material reconocible: papel, cartulina, acetato, metal o pintura.
- **Do** conserva tinta azul, iconografía lineal y el orden cromático de los seis capítulos.
- **Do** usa el índice como primer nivel de exploración y mantiene la ficha asociada inmediatamente después.
- **Do** centra el manual en escritorio y aplica el reflujo compacto establecido a 640 px y 350 px.
- **Do** ofrece foco visible, navegación por teclado, colores forzados y una experiencia sin transición cuando se solicita movimiento reducido.
- **Do** haz que cada movimiento salga de la unión física de la pieza y termine en su reposo exacto.

### Don't:

- **Don't** conviertas el sistema en un dashboard de tarjetas blancas, una cuadrícula de juegos o una colección de paneles redondeados intercambiables.
- **Don't** uses vidrio, blur, sombras o textura fuera de una pieza física que explique su presencia.
- **Don't** reemplaces las voces tipográficas por una sola sans-serif ni uses Kalam como cuerpo de lectura.
- **Don't** reasignes los colores de capítulo como estados semánticos ni pierdas la tinta común sobre ellos.
- **Don't** uses emoji, iconos rellenos incongruentes, gradiente en texto o cápsulas perfectas como atajo para la personalidad.
- **Don't** escribas duraciones, curvas o retardos sueltos: toda animación nueva usa los tokens y los gestos `.motion-*` existentes, o añade uno al sistema.
