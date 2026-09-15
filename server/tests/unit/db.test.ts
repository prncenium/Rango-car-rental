import type mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { assertReplicaSet, ReplicaSetRequiredError } from '../../src/config/db.js';

function fakeConnection(hello: Record<string, unknown>): mongoose.Connection {
  return {
    db: {
      admin: () => ({
        command: async () => hello,
      }),
    },
  } as unknown as mongoose.Connection;
}

describe('db connection (INF-02)', () => {
  it('throws ReplicaSetRequiredError against a standalone mongod (no setName)', async () => {
    const conn = fakeConnection({ ismaster: true });
    await expect(assertReplicaSet(conn)).rejects.toThrow(ReplicaSetRequiredError);
  });

  it('resolves against a replica-set connection (setName present)', async () => {
    const conn = fakeConnection({ setName: 'rs0' });
    await expect(assertReplicaSet(conn)).resolves.toBeUndefined();
  });
});
