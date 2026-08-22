import http from 'http';
import { Server } from 'socket.io';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { bootstrapRequiredData } from './services/bootstrapService.js';
import { ensureRounds } from './services/roundService.js';
import { setIo } from './services/socketBus.js';
import { registerSockets } from './sockets/index.js';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientUrl,
    credentials: true
  }
});

setIo(io);
registerSockets(io);

await connectDb();
await ensureRounds();
await bootstrapRequiredData();

server.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
