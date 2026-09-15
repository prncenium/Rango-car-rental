import type { ClientSession, Document, Types } from 'mongoose';
import type { AuditAction, AuditEntityType, Role } from '@rango/shared';
import type { ActorContext } from '../lib/actor.js';
import { ForbiddenTransitionError, InvalidTransitionError } from '../lib/errors.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { runGuards } from './runGuards.js';
import type { Guard } from './guards/types.js';

export interface TransitionEdge<E> {
  from: string;
  to: string;
  actorClasses: readonly Role[];
  guards: ReadonlyArray<Guard<E>>;
  auditAction: AuditAction;
  // Extra fields to Object.assign onto the entity alongside the field write
  // itself (e.g. approvedBy/approvedAt). Computed from the entity/actor so
  // timestamps and actor ids are never taken from the request body (D10).
  sideEffects?: (entity: E, actor: ActorContext) => Record<string, unknown>;
}

// A registry is keyed by "<entityType>:<field>" because Car (design D2) has
// two independent state machines on two different fields — there is no
// single `status` field to key transitions off for every entity.
export type TransitionRegistry<E> = Map<string, TransitionEdge<E>[]>;

export function registryKey(entityType: AuditEntityType, field: string): string {
  return `${entityType}:${field}`;
}

export function findEdge<E>(
  registry: TransitionRegistry<E>,
  entityType: AuditEntityType,
  field: string,
  from: string,
  to: string,
): TransitionEdge<E> | undefined {
  const edges = registry.get(registryKey(entityType, field));
  return edges?.find((e) => e.from === from && e.to === to);
}

export interface TransitionInput<E extends Document & { _id: Types.ObjectId }> {
  registry: TransitionRegistry<E>;
  entityType: AuditEntityType;
  field: string; // e.g. 'status' | 'moderationStatus' | 'listingState'
  entity: E;
  to: string;
  actor: ActorContext;
  session: ClientSession;
  reason?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// design §5.2 / §6 — the five-step chokepoint. Every admin state write in
// this codebase goes through this function, inside a transaction the caller
// owns (transition() never starts its own session).
export async function transition<E extends Document & { _id: Types.ObjectId }>(
  input: TransitionInput<E>,
): Promise<E> {
  const { registry, entityType, field, entity, to, actor, session, reason, metadata } = input;
  const from = entity.get(field) as string;

  // 1. Does this edge exist at all?
  const edge = findEdge(registry, entityType, field, from, to);
  if (!edge) {
    throw new InvalidTransitionError(`No such transition: ${entityType}.${field} ${from} -> ${to}.`, {
      entityType,
      field,
      from,
      to,
    });
  }

  // 2. Is this actor's role permitted on this edge? (AUTHZ-1/2)
  if (!edge.actorClasses.includes(actor.role)) {
    throw new ForbiddenTransitionError(`Role ${actor.role} may not perform this transition.`, {
      entityType,
      field,
      from,
      to,
      actorClasses: edge.actorClasses,
    });
  }

  // 3. Run every declared guard, in order, short-circuiting on the first failure.
  await runGuards(edge.guards, entity, actor, session);

  // 4. Apply the field write and the edge's declared side-effect fields.
  entity.set(field, to);
  if (edge.sideEffects) {
    Object.assign(entity as unknown as Record<string, unknown>, edge.sideEffects(entity, actor));
  }
  await entity.save({ session });

  // 5. Write exactly one AuditLog document, in the same session (INV-3).
  await AuditLog.create(
    [
      {
        actor: actor.userId,
        actorRole: actor.role,
        action: edge.auditAction,
        entityType,
        entityId: entity._id,
        previousState: from,
        newState: to,
        reason,
        metadata,
        ipAddress: actor.ip,
      },
    ],
    { session },
  );

  return entity;
}

export interface TransitionWithEdgeInput<E extends Document & { _id: Types.ObjectId }> {
  edge: TransitionEdge<E>;
  entityType: AuditEntityType;
  field: string;
  entity: E;
  actor: ActorContext;
  session: ClientSession;
  reason?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// Same five steps as transition(), but for edges that share a (from, to)
// pair with another registered edge and so cannot be disambiguated by
// findEdge() alone (e.g. the D6 unpaid-override activation, which the
// service layer selects explicitly based on whether `overrideReason` was
// supplied — see booking.service.ts).
export async function transitionWithEdge<E extends Document & { _id: Types.ObjectId }>(
  input: TransitionWithEdgeInput<E>,
): Promise<E> {
  const { edge, entityType, field, entity, actor, session, reason, metadata } = input;
  const from = entity.get(field) as string;

  if (from !== edge.from) {
    throw new InvalidTransitionError(`No such transition: ${entityType}.${field} ${from} -> ${edge.to}.`, {
      entityType,
      field,
      from,
      to: edge.to,
    });
  }
  if (!edge.actorClasses.includes(actor.role)) {
    throw new ForbiddenTransitionError(`Role ${actor.role} may not perform this transition.`, {
      entityType,
      field,
      from,
      to: edge.to,
      actorClasses: edge.actorClasses,
    });
  }
  await runGuards(edge.guards, entity, actor, session);

  entity.set(field, edge.to);
  if (edge.sideEffects) {
    Object.assign(entity as unknown as Record<string, unknown>, edge.sideEffects(entity, actor));
  }
  await entity.save({ session });

  await AuditLog.create(
    [
      {
        actor: actor.userId,
        actorRole: actor.role,
        action: edge.auditAction,
        entityType,
        entityId: entity._id,
        previousState: from,
        newState: edge.to,
        reason,
        metadata,
        ipAddress: actor.ip,
      },
    ],
    { session },
  );

  return entity;
}
