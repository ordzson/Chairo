import { inject, type Provider } from '@angular/core';
import type { Routes } from '@angular/router';

import { SUPABASE_CONFIG, supabaseBackendResolver } from '../../supabase.config';
import { GamePort } from './domain/game.port';
import { MultiplayerPort } from './domain/multiplayer.port';
import { InMemoryGameAdapter } from './infrastructure/in-memory-game.adapter';
import { InMemoryMultiplayerAdapter } from './infrastructure/in-memory-multiplayer.adapter';
import { SupabaseGameAdapter } from './infrastructure/supabase-game.adapter';
import { SupabaseMultiplayerAdapter } from './infrastructure/supabase-multiplayer.adapter';

/**
 * Configuración y sala comparten el mismo adaptador: la sala creada en la
 * primera pantalla es la que abre la segunda.
 *
 * Con backend configurado la sala vive en Supabase y se sincroniza entre
 * teléfonos; sin él la aplicación sigue siendo jugable en un dispositivo con
 * el adaptador en memoria. La presentación no distingue entre los dos.
 */
const multiplayerProviders: Provider[] = [
  InMemoryMultiplayerAdapter,
  SupabaseMultiplayerAdapter,
  {
    provide: MultiplayerPort,
    useFactory: (): MultiplayerPort => inject(SUPABASE_CONFIG) === null
      ? inject(InMemoryMultiplayerAdapter)
      : inject(SupabaseMultiplayerAdapter)
  },
  InMemoryGameAdapter,
  SupabaseGameAdapter,
  {
    provide: GamePort,
    useFactory: (): GamePort => inject(SUPABASE_CONFIG) === null
      ? inject(InMemoryGameAdapter)
      : inject(SupabaseGameAdapter)
  }
];

export const versiculoRoutes: Routes = [
  {
    path: '',
    providers: multiplayerProviders,
    resolve: { backend: supabaseBackendResolver },
    children: [
      {
        path: '',
        title: 'Configurar ¿Versículo o inventículo? · Chairo',
        loadComponent: () => import('./pages/setup/setup.page').then(module => module.SetupPageComponent)
      },
      {
        path: 'sala/:codigo',
        title: 'Sala de ¿Versículo o inventículo? · Chairo',
        loadComponent: () => import('./pages/room/room.page').then(module => module.RoomPageComponent)
      },
      {
        // Con el código del QR y sin él, para quien lo teclea: la misma pantalla.
        path: 'unirse/:codigo',
        title: 'Entrar a ¿Versículo o inventículo? · Chairo',
        loadComponent: () => import('./pages/join/join.page').then(module => module.JoinPageComponent)
      },
      {
        path: 'unirse',
        title: 'Entrar a ¿Versículo o inventículo? · Chairo',
        loadComponent: () => import('./pages/join/join.page').then(module => module.JoinPageComponent)
      },
      {
        path: 'partida/:codigo',
        title: 'Partida de ¿Versículo o inventículo? · Chairo',
        loadComponent: () => import('./pages/game/game.page').then(module => module.GamePageComponent)
      }
    ]
  }
];
