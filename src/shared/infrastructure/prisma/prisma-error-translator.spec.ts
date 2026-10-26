import { BusinessError } from '../../domain/errors/domain-error';
import { Prisma } from '../../../generated/prisma/client';
import {
  PrismaErrorTranslator,
  VALUE_TOO_LARGE_CODE,
  VALUE_TOO_LARGE_MESSAGE,
} from './prisma-error-translator';

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

describe('PrismaErrorTranslator', () => {
  const translator = new PrismaErrorTranslator();

  it('turns an out-of-range value (P2020) into a business error', () => {
    const translated = translator.translate(knownError('P2020'));

    expect(translated).toBeInstanceOf(BusinessError);
    expect(translated?.code).toBe(VALUE_TOO_LARGE_CODE);
    expect(translated?.message).toBe(VALUE_TOO_LARGE_MESSAGE);
  });

  it.each([knownError('P2002'), knownError('P2025'), new Error('P2020'), 'P2020', undefined])(
    'leaves %p untranslated',
    (error) => {
      expect(translator.translate(error)).toBeUndefined();
    },
  );
});
