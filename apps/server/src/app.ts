import express from 'express';
import type { HealthResponse } from '@relay-miden/shared';

export const app = express();
app.disable('x-powered-by');
app.get('/health', (_request, response) => {
  const health: HealthResponse = { status: 'ok', service: 'relay-miden-server', phase: 2 };
  response.set('Cache-Control', 'no-store').json(health);
});
