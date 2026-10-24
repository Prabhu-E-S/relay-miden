import { defaultInstance } from './app.js';

const { httpServer, config, serverDeviceId } = defaultInstance;

httpServer.listen(config.port, config.host, () => {
  console.log(`Relay Miden LAN server listening on http://${config.host}:${config.port}`);
  console.log(`Server Device ID: ${serverDeviceId}`);
  console.log(`Health endpoint: http://${config.host}:${config.port}/health`);
  console.log(`Database path: ${config.dbPath}`);
});

httpServer.on('error', (error) => {
  console.error('Server error:', error.message);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    void defaultInstance.close().then(() => process.exit(0));
  });
}
