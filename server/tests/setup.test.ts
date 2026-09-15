import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

const Ping = mongoose.model('Ping', new mongoose.Schema({ value: Number }));

describe('replica-set test harness (P-04)', () => {
  it('boots a replset and runs a trivial query', async () => {
    const doc = await Ping.create({ value: 1 });
    expect(doc.value).toBe(1);
  });

  it('commits a two-document transaction opened in a session', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await Ping.create([{ value: 10 }], { session });
      await Ping.create([{ value: 20 }], { session });
      await session.commitTransaction();
    } finally {
      await session.endSession();
    }

    const count = await Ping.countDocuments({ value: { $in: [10, 20] } });
    expect(count).toBe(2);
  });
});
