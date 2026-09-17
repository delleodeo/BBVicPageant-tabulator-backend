import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns', () => ({
  default: {
    promises: { resolveSrv: vi.fn() },
    setServers: vi.fn()
  }
}));

vi.mock('mongoose', () => ({
  default: {
    set: vi.fn(),
    connect: vi.fn(),
    connection: { readyState: 1 }
  }
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    mongoUri: 'mongodb+srv://user:password@cluster.example.net/database',
    mongoDnsServers: ['1.1.1.1', '8.8.8.8']
  }
}));

import dns from 'node:dns';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';

describe('MongoDB SRV DNS resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mongoose.connect).mockResolvedValue(mongoose);
  });

  it('uses the default DNS resolver when the SRV lookup succeeds', async () => {
    vi.mocked(dns.promises.resolveSrv).mockResolvedValueOnce([{ name: 'db.example.net', port: 27017 }]);

    await connectDb();

    expect(dns.setServers).not.toHaveBeenCalled();
    expect(mongoose.connect).toHaveBeenCalledWith('mongodb+srv://user:password@cluster.example.net/database');
  });

  it.each(['EBADRESP', 'ECONNREFUSED', 'ESERVFAIL', 'ETIMEOUT'])(
    'retries a %s SRV failure with the configured fallback resolvers',
    async (errorCode) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(dns.promises.resolveSrv)
      .mockRejectedValueOnce(Object.assign(new Error('DNS resolution failed'), { code: errorCode }))
      .mockResolvedValueOnce([{ name: 'db.example.net', port: 27017 }]);

    await connectDb();

    expect(dns.setServers).toHaveBeenCalledWith(['1.1.1.1', '8.8.8.8']);
    expect(dns.promises.resolveSrv).toHaveBeenCalledTimes(2);
    expect(mongoose.connect).toHaveBeenCalledOnce();
    }
  );

  it('does not mask unrelated DNS errors', async () => {
    vi.mocked(dns.promises.resolveSrv)
      .mockRejectedValueOnce(Object.assign(new Error('Record not found'), { code: 'ENOTFOUND' }));

    await expect(connectDb()).rejects.toMatchObject({ code: 'ENOTFOUND' });
    expect(dns.setServers).not.toHaveBeenCalled();
    expect(mongoose.connect).not.toHaveBeenCalled();
  });
});
