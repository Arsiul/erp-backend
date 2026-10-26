import {
  RESOURCE_CAPABILITIES,
  type ResourceAction,
} from '../../domain/authorization/capabilities';
import type { ResourceKey } from '../../domain/authorization/resources';
import { NotFoundError } from '../../domain/errors/domain-error';

export const UNKNOWN_ACTION = 'La acción no existe para este registro.';

/** The catalog entry of `POST /:resource/:id/:action`; an action outside it answers 404. */
export function requireAction(resource: ResourceKey, actionId: string): ResourceAction {
  const action = RESOURCE_CAPABILITIES[resource].actions.find((item) => item.id === actionId);
  if (action === undefined) {
    throw new NotFoundError(UNKNOWN_ACTION);
  }
  return action;
}
