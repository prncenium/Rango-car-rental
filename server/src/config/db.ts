import mongoose from 'mongoose';
import { env } from './env.js';

export class ReplicaSetRequiredError extends Error {
  constructor() {
    super(
      'MongoDB connection must be a replica set — multi-document transactions ' +
        '(design §9, §5.2, §6.1) are not available on a standalone mongod. ' +
        'Start MongoDB with --replSet and initiate it, or point MONGODB_URI at one that already is.',
    );
    this.name = 'ReplicaSetRequiredError';
  }
}

type HelloResult = { setName?: string };

// Split out from connectDb so it can be unit-tested against a fake
// connection without standing up a real standalone mongod (INF-02 test).
export async function assertReplicaSet(connection: mongoose.Connection): Promise<void> {
  const db = connection.db;
  if (!db) {
    throw new Error('assertReplicaSet called before the connection finished establishing a db handle');
  }
  const hello = (await db.admin().command({ hello: 1 })) as HelloResult;
  if (!hello.setName) {
    throw new ReplicaSetRequiredError();
  }
}

export async function connectDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  await mongoose.connect(uri);
  try {
    await assertReplicaSet(mongoose.connection);
  } catch (err) {
    await mongoose.disconnect();
    throw err;
  }
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
