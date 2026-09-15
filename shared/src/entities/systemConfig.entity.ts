import { z } from 'zod';

export const systemConfigEntitySchema = z.object({
  _id: z.literal('singleton'),
  booking: z.object({
    maxDurationDays: z.number().int().positive().default(90),
    maxAdvanceDays: z.number().int().positive().default(365),
    maxOpenRequestsPerUser: z.number().int().positive().default(5),
    turnaroundBufferDays: z.number().int().min(0).max(7).default(0),
    defaultDepositAmount: z.number().min(0).default(0),
  }),
  availability: z.object({
    publicWindowDays: z.number().int().positive().default(180),
  }),
  security: z.object({
    adminMaxConcurrentSessions: z.number().int().min(0).default(0), // 0 = unlimited
  }),
  listing: z.object({
    maxImagesPerCar: z.number().int().positive().default(12),
  }),
  platform: z.object({
    registrationOpen: z.boolean().default(true),
  }),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type SystemConfigEntity = z.infer<typeof systemConfigEntitySchema>;
