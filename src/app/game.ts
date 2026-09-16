export type GameIcon = 'bulb' | 'question' | 'compass' | 'book' | 'shell' | 'trophy';
export type GameColor = 'yellow' | 'orange' | 'turquoise' | 'blue' | 'green' | 'violet';

export interface Game {
  readonly id: string;
  readonly name: string;
  readonly icon: GameIcon;
  readonly color: GameColor;
  /** Preview plate shown on the game sheet. */
  readonly preview: string;
  /** Alt text describing the preview plate. */
  readonly previewAlt: string;
  readonly status: 'available' | 'coming-soon';
  readonly route?: string;
}

export const GAMES: readonly Game[] = [
  {
    id: 'jeopardy',
    name: 'Jeopardy',
    icon: 'bulb',
    color: 'yellow',
    preview: 'assets/plates/stage.png',
    previewAlt: 'Escenario azul con tres podios: 100, 200 y 300',
    status: 'coming-soon'
  },
  {
    id: 'versiculo-o-inventiculo',
    name: '¿Versículo o inventículo?',
    icon: 'question',
    color: 'orange',
    preview: 'assets/plates/stage-versiculo-o-inventiculo.png',
    previewAlt: 'Escenario azul con dos podios: uno marcado con un visto verde y otro con una cruz roja',
    status: 'available',
    route: '/juegos/versiculo-o-inventiculo'
  },
  {
    id: 'discipulo-perdido',
    name: 'El discípulo más perdido',
    icon: 'compass',
    color: 'turquoise',
    preview: 'assets/plates/stage-discipulo-perdido.png',
    previewAlt: 'Escenario azul con dos concursantes celebrando y un tercero eliminado bajo un foco',
    status: 'coming-soon'
  },
  {
    id: 'revelaciones',
    name: 'Revelaciones',
    icon: 'book',
    color: 'blue',
    preview: 'assets/plates/stage-revelaciones.png',
    previewAlt: 'Escenario azul con una palabra oculta en casillas vacías y una llave dorada sobre ella',
    status: 'coming-soon'
  },
  {
    id: 'buscando-perlas',
    name: 'Buscando perlas',
    icon: 'shell',
    color: 'green',
    preview: 'assets/plates/stage-buscando-perlas.png',
    previewAlt: 'Escenario azul con una Biblia abierta entre dos espadas y dos concursantes lanzándose al pulsador',
    status: 'coming-soon'
  },
  {
    id: 'trivia',
    name: 'Trivia',
    icon: 'trophy',
    color: 'violet',
    preview: 'assets/plates/stage-trivia.png',
    previewAlt: 'Escenario azul con una pantalla de signo de interrogación y cuatro opciones de respuesta',
    status: 'coming-soon'
  }
] as const;
