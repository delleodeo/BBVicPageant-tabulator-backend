import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

function mongoSrvHostname(uri) {
  if (!uri?.startsWith('mongodb+srv://')) return null;

  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}

async function ensureMongoSrvResolution() {
  const hostname = mongoSrvHostname(env.mongoUri);
  if (!hostname) return;

  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${hostname}`);
  } catch (error) {
    if (error.code !== 'EBADRESP' || env.mongoDnsServers.length === 0) throw error;

    dns.setServers(env.mongoDnsServers);
    console.warn(`Default DNS returned an invalid MongoDB SRV response. Retrying with ${env.mongoDnsServers.join(', ')}.`);
    await dns.promises.resolveSrv(`_mongodb._tcp.${hostname}`);
  }
}

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await ensureMongoSrvResolution();
  await mongoose.connect(env.mongoUri);
  return mongoose.connection;
}
