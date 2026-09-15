import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

// D5/§7/§9 require multi-document transactions, which only a replica set
// supports — so the test harness runs one, not a standalone in-memory mongod.
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();
  await mongoose.connect(uri);
  // Mongoose builds indexes in the background by default; tests that assert
  // on unique constraints or index presence need them to exist synchronously.
  await Promise.all(Object.values(mongoose.connection.models).map((m) => m.init()));
}, 60_000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});
