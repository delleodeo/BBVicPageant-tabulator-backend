import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

const RETRYABLE_DNS_ERRORS = new Set(['EBADRESP', 'ECONNREFUSED', 'ESERVFAIL', 'ETIMEOUT']);

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
    if (!RETRYABLE_DNS_ERRORS.has(error.code) || env.mongoDnsServers.length === 0) throw error;

    dns.setServers(env.mongoDnsServers);
    console.warn(`Default DNS failed to resolve MongoDB SRV (${error.code}). Retrying with ${env.mongoDnsServers.join(', ')}.`);
    await dns.promises.resolveSrv(`_mongodb._tcp.${hostname}`);
  }
}

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await ensureMongoSrvResolution();
  await mongoose.connect(env.mongoUri);
  return mongoose.connection;
}
