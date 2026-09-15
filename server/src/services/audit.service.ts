import type { FilterQuery } from 'mongoose';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditAction, type AuditEntityType } from '@rango/shared';
import { AuditLog, type AuditLogDoc } from '../models/AuditLog.model.js';
import { ValidationError } from '../lib/errors.js';

export interface AuditQuery {
  entityType?: string | undefined;
  entityId?: string | undefined;
  actor?: string | undefined;
  action?: string | undefined;
  createdAtFrom?: string | undefined;
  createdAtTo?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

// ADM-01 — filters compose (AND across fields), paginated, admin-only.
export async function queryAuditLog(query: AuditQuery) {
  const page = query.page && query.page >= 1 ? query.page : 1;
  const limit = query.limit && query.limit >= 1 && query.limit <= 100 ? query.limit : 20;

  if (query.entityType && !AUDIT_ENTITY_TYPES.includes(query.entityType as AuditEntityType)) {
    throw new ValidationError('Invalid entityType.', { source: 'query', fieldErrors: { entityType: ['unknown value'] } });
  }
  if (query.action && !AUDIT_ACTIONS.includes(query.action as AuditAction)) {
    throw new ValidationError('Invalid action.', { source: 'query', fieldErrors: { action: ['unknown value'] } });
  }

  const filter: FilterQuery<AuditLogDoc> = {};
  if (query.entityType) filter.entityType = query.entityType as AuditEntityType;
  if (query.entityId) filter.entityId = query.entityId as unknown as AuditLogDoc['entityId'];
  if (query.actor) filter.actor = query.actor as unknown as AuditLogDoc['actor'];
  if (query.action) filter.action = query.action as AuditAction;
  if (query.createdAtFrom || query.createdAtTo) {
    filter.createdAt = {};
    if (query.createdAtFrom) filter.createdAt.$gte = new Date(query.createdAtFrom);
    if (query.createdAtTo) filter.createdAt.$lt = new Date(query.createdAtTo);
  }

  const [data, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      sort: 'createdAt:desc',
    },
  };
}
