import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Chairo · Centro de juegos',
    loadComponent: () => import('./pages/game-center/game-center.page').then(module => module.GameCenterPageComponent)
  },
  {
    path: 'juegos/jeopardy',
    loadChildren: () => import('./games/jeopardy/jeopardy.routes').then(module => module.jeopardyRoutes)
  },
  {
    path: 'juegos/versiculo-o-inventiculo',
    loadChildren: () => import('./games/versiculo-o-inventiculo/versiculo.routes').then(module => module.versiculoRoutes)
  },
  { path: '**', redirectTo: '' }
];
