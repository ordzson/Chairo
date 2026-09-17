import { inject, type Provider } from '@angular/core';
import type { Routes } from '@angular/router';

import { SUPABASE_CONFIG, supabaseBackendResolver } from '../../supabase.config';
import { JeopardyPort } from './domain/jeopardy.port';
import { InMemoryJeopardyAdapter } from './infrastructure/in-memory-jeopardy.adapter';
import { SupabaseJeopardyAdapter } from './infrastructure/supabase-jeopardy.adapter';

/**
 * Igual que en ¿Versículo o inventículo?: con backend configurado la sala vive
 * en Supabase y la comparten los teléfonos; sin él se juega en este navegador.
 * Todas las pantallas comparten el mismo adaptador.
 */
const jeopardyProviders: Provider[] = [
  InMemoryJeopardyAdapter,
  SupabaseJeopardyAdapter,
  {
    provide: JeopardyPort,
    useFactory: (): JeopardyPort => inject(SUPABASE_CONFIG) === null
      ? inject(InMemoryJeopardyAdapter)
      : inject(SupabaseJeopardyAdapter)
  }
];

export const jeopardyRoutes: Routes = [{
  path: '',
  providers: jeopardyProviders,
  resolve: { backend: supabaseBackendResolver },
  children: [
    {
      path: '',
      title: 'Configurar Jeopardy · Chairo',
      loadComponent: () => import('./pages/setup/setup.page').then(module => module.JeopardySetupPageComponent)
    },
    {
      // «Jugar otra vez»: la misma configuración, pero reinicia la sala abierta.
      path: 'sala/:codigo/configurar',
      title: 'Configurar Jeopardy · Chairo',
      loadComponent: () => import('./pages/setup/setup.page').then(module => module.JeopardySetupPageComponent)
    },
    {
      path: 'sala/:codigo',
      title: 'Sala de Jeopardy · Chairo',
      loadComponent: () => import('./pages/room/room.page').then(module => module.JeopardyRoomPageComponent)
    },
    {
      path: 'unirse/:codigo',
      title: 'Entrar a Jeopardy · Chairo',
      loadComponent: () => import('./pages/join/join.page').then(module => module.JeopardyJoinPageComponent)
    },
    {
      path: 'unirse',
      title: 'Entrar a Jeopardy · Chairo',
      loadComponent: () => import('./pages/join/join.page').then(module => module.JeopardyJoinPageComponent)
    },
    {
      path: 'partida/:codigo',
      title: 'Partida de Jeopardy · Chairo',
      loadComponent: () => import('./pages/game/game.page').then(module => module.JeopardyGamePageComponent)
    }
  ]
}];
