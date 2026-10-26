import { Injectable } from '@nestjs/common';
import { BusinessError, type DomainError } from '../../domain/errors/domain-error';
import type { ErrorTranslator } from '../../domain/ports/error-translator.port';
import { Prisma } from '../../../generated/prisma/client';

/** A value does not fit its column (e.g. an amount larger than its `Decimal` precision). */
const VALUE_OUT_OF_RANGE = 'P2020';
export const VALUE_TOO_LARGE_CODE = 'VALUE_TOO_LARGE';
export const VALUE_TOO_LARGE_MESSAGE = 'El valor excede el máximo permitido.';

/** Prisma errors that come from the data the user sent, answered as business errors (422). */
@Injectable()
export class PrismaErrorTranslator implements ErrorTranslator {
  translate(error: unknown): DomainError | undefined {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === VALUE_OUT_OF_RANGE
    ) {
      return new BusinessError(VALUE_TOO_LARGE_MESSAGE, VALUE_TOO_LARGE_CODE);
    }
    return undefined;
  }
}
