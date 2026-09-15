import type { ClientSession } from 'mongoose';
import { SystemConfig, type SystemConfigDoc } from '../models/SystemConfig.model.js';

// design D12 — read at the moment each guard runs, never cached across a
// request boundary. Falls back to the documented defaults if the singleton
// has not been seeded yet, so a guard never breaks on a missing config row.
const DEFAULT_BOOKING_CONFIG: SystemConfigDoc['booking'] = {
  maxDurationDays: 90,
  maxAdvanceDays: 365,
  maxOpenRequestsPerUser: 5,
  turnaroundBufferDays: 0,
  defaultDepositAmount: 0,
};

export async function getBookingConfig(session: ClientSession): Promise<SystemConfigDoc['booking']> {
  const config = await SystemConfig.findById('singleton').session(session).lean();
  return config?.booking ?? DEFAULT_BOOKING_CONFIG;
}
