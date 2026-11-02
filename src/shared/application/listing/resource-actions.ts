import {
  RESOURCE_CAPABILITIES,
  type ResourceAction,
} from '../../domain/authorization/capabilities';
import type { ResourceKey } from '../../domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../domain/errors/domain-error';
import { requireText } from '../../domain/validation/field-rules';

export const UNKNOWN_ACTION = 'La acción no existe para este registro.';

/** The catalog entry of `POST /:resource/:id/:action`; an action outside it answers 404. */
export function requireAction(resource: ResourceKey, actionId: string): ResourceAction {
  const action = RESOURCE_CAPABILITIES[resource].actions.find((item) => item.id === actionId);
  if (action === undefined) {
    throw new NotFoundError(UNKNOWN_ACTION);
  }
  return action;
}

/** Body of `POST /:resource/:id/:action`; only cancellations and rejections read it. */
export interface ActionInput {
  readonly reason?: unknown;
}

export const REASON_REQUIRED = 'Indica el motivo.';
const REASON_MAX_LENGTH = 500;

/** Cancelling or rejecting a document requires a reason, kept on the record for later review. */
export function requireReason(input: ActionInput): string {
  const reason = requireText(input.reason, REASON_REQUIRED);
  if (reason.length > REASON_MAX_LENGTH) {
    throw new BusinessError(`El motivo admite hasta ${String(REASON_MAX_LENGTH)} caracteres.`);
  }
  return reason;
}
