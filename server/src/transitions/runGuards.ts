import type { ClientSession } from 'mongoose';
import type { ActorContext } from '../lib/actor.js';
import { GuardFailedError } from '../lib/errors.js';
import type { Guard } from './guards/types.js';

// TR-01 — guards run in declared order and short-circuit on the first
// failure, naming exactly which guard failed (design §5.2 step 3).
export async function runGuards<E>(
  guards: ReadonlyArray<Guard<E>>,
  entity: E,
  actor: ActorContext,
  session: ClientSession,
): Promise<void> {
  for (const guard of guards) {
    const result = await guard.check(entity, actor, session);
    if (!result.ok) {
      throw new GuardFailedError(`Guard failed: ${guard.name}`, {
        guard: guard.name,
        ...result.details,
      });
    }
  }
}
