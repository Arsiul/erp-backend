import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

const WHITELIST_CONSTRAINT = 'whitelistValidation';
const DEFAULT_MESSAGE = 'Los datos enviados no son válidos.';

function firstMessage(errors: readonly ValidationError[]): string | undefined {
  for (const error of errors) {
    const constraints = error.constraints ?? {};
    if (WHITELIST_CONSTRAINT in constraints) {
      return `El campo ${error.property} no está permitido.`;
    }
    const [message] = Object.values(constraints);
    if (message !== undefined) {
      return message;
    }
    const nested = firstMessage(error.children ?? []);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

/** ValidationPipe exceptionFactory: reports only the first failing constraint. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException(firstMessage(errors) ?? DEFAULT_MESSAGE);
}
