import type { ClientSession } from 'mongoose';
import type { ActorContext } from '../../lib/actor.js';

export type GuardResult = { ok: true } | { ok: false; details?: Record<string, unknown> };

// design §5.4 — every guard is a named, independently unit-testable function
// taking exactly (entity, actor, session). None of them lives inline in a
// service or route handler; runGuards() (below) is the only caller.
export interface Guard<E = unknown> {
  name: string;
  check: (entity: E, actor: ActorContext, session: ClientSession) => Promise<GuardResult> | GuardResult;
}
