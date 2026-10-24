import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from './app';
let server: Server;
let base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});
describe('backend foundation', () => {
  it('serves a real no-store health response', async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('x-powered-by')).toBe(false);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'relay-miden-server',
      phase: 2,
    });
  });
  it('has no prematurely implemented task API', async () => {
    expect((await fetch(`${base}/tasks`)).status).toBe(404);
  });
});
