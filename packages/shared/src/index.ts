export * from './tasks.js';
export * from './paperbridge.js';
export * from './paperbridge-v2.js';
export * from './sync.js';
export * from './multilingual.js';

export type Language = 'en' | 'ml' | 'ta';

export interface HealthResponse {
  status: 'ok';
  service: 'relay-miden-server';
  phase: 2;
}
