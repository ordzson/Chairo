import { inject, type Provider } from '@angular/core';
import type { Routes } from '@angular/router';

import { SUPABASE_CONFIG, supabaseBackendResolver } from '../../supabase.config';
import { PasswordPort } from './domain/password.port';
import { InMemoryPasswordAdapter } from './infrastructure/in-memory-password.adapter';
import { SupabasePasswordAdapter } from './infrastructure/supabase-password.adapter';

const passwordProviders: Provider[] = [
  InMemoryPasswordAdapter,
  SupabasePasswordAdapter,
  {
    provide: PasswordPort,
    useFactory: (): PasswordPort => inject(SUPABASE_CONFIG) === null
      ? inject(InMemoryPasswordAdapter)
      : inject(SupabasePasswordAdapter)
  }
];

export const passwordRoutes: Routes = [
  {
    path: '',
    providers: passwordProviders,
    resolve: { backend: supabaseBackendResolver },
    children: [
      {
        path: '',
        title: 'Configurar Revelaciones · Chairo',
        loadComponent: () => import('./pages/setup/setup.page').then(module => module.PasswordSetupPageComponent)
      },
      {
        path: 'unirse/:codigo',
        title: 'Entrar a Revelaciones · Chairo',
        loadComponent: () => import('./pages/join/join.page').then(module => module.PasswordJoinPageComponent)
      },
      {
        path: 'unirse',
        title: 'Entrar a Revelaciones · Chairo',
        loadComponent: () => import('./pages/join/join.page').then(module => module.PasswordJoinPageComponent)
      },
      {
        path: 'sala/:codigo',
        title: 'Sala de Revelaciones · Chairo',
        loadComponent: () => import('./pages/room/room.page').then(module => module.PasswordRoomPageComponent)
      },
      {
        path: 'partida/:codigo',
        title: 'Partida de Revelaciones · Chairo',
        loadComponent: () => import('./pages/game/game.page').then(module => module.PasswordGamePageComponent)
      }
    ]
  }
];

