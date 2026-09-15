import { describe, expect, it } from 'vitest';
import { SystemConfig } from '../../../src/models/SystemConfig.model.js';

describe('SystemConfig model (D12)', () => {
  it('is a singleton document read by _id: "singleton"', async () => {
    await SystemConfig.create({
      _id: 'singleton',
      booking: {
        maxDurationDays: 90,
        maxAdvanceDays: 365,
        maxOpenRequestsPerUser: 5,
        turnaroundBufferDays: 0,
        defaultDepositAmount: 0,
      },
      availability: { publicWindowDays: 180 },
      security: { adminMaxConcurrentSessions: 0 },
      listing: { maxImagesPerCar: 12 },
      platform: { registrationOpen: true },
    });

    const config = await SystemConfig.findById('singleton');
    expect(config).not.toBeNull();
    expect(config!.booking.maxDurationDays).toBe(90);
  });

  it('rejects turnaroundBufferDays outside 0..7', async () => {
    await expect(
      SystemConfig.create({
        _id: 'singleton',
        booking: {
          maxDurationDays: 90,
          maxAdvanceDays: 365,
          maxOpenRequestsPerUser: 5,
          turnaroundBufferDays: 8,
          defaultDepositAmount: 0,
        },
        availability: { publicWindowDays: 180 },
        security: { adminMaxConcurrentSessions: 0 },
        listing: { maxImagesPerCar: 12 },
        platform: { registrationOpen: true },
      }),
    ).rejects.toThrow();
  });
});
