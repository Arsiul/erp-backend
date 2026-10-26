import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  BusinessError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  OperationNotAllowedError,
  UnauthorizedError,
} from '../../domain/errors/domain-error';
import type { ErrorTranslator } from '../../domain/ports/error-translator.port';
import { GlobalExceptionFilter } from './global-exception.filter';

const INTERNAL = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.',
};

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let logError: jest.SpyInstance;
  let translate: jest.MockedFunction<ErrorTranslator['translate']>;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    translate = jest.fn<ReturnType<ErrorTranslator['translate']>, [unknown]>();
    filter = new GlobalExceptionFilter({ translate });
  });

  afterEach(() => {
    logError.mockRestore();
  });

  describe('domain errors', () => {
    it.each([
      [new BusinessError('Stock insuficiente.', 'INSUFFICIENT_STOCK'), 422, 'INSUFFICIENT_STOCK'],
      [new NotFoundError(), 404, 'NOT_FOUND'],
      [new ConflictError('Ya existe.'), 409, 'CONFLICT'],
      [new ForbiddenError(), 403, 'FORBIDDEN'],
      [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
      [new OperationNotAllowedError('Documento anulado.'), 405, 'OPERATION_NOT_ALLOWED'],
    ])('maps %s to %i', (error, statusCode, code) => {
      expect(filter.toBody(error)).toEqual({ statusCode, code, message: error.message });
      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe('adapter errors', () => {
    it('answers the domain error the translator recognises, without logging', () => {
      const adapterError = new Error('numeric field overflow');
      translate.mockReturnValue(
        new BusinessError('El valor excede el máximo permitido.', 'VALUE_TOO_LARGE'),
      );

      expect(filter.toBody(adapterError)).toEqual({
        statusCode: 422,
        code: 'VALUE_TOO_LARGE',
        message: 'El valor excede el máximo permitido.',
      });
      expect(translate).toHaveBeenCalledWith(adapterError);
      expect(logError).not.toHaveBeenCalled();
    });

    it('does not ask the translator about domain errors', () => {
      filter.toBody(new NotFoundError());
      expect(translate).not.toHaveBeenCalled();
    });
  });

  describe('HTTP exceptions', () => {
    it('keeps the validation message for 400', () => {
      expect(filter.toBody(new BadRequestException('El campo ruc es obligatorio.'))).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'El campo ruc es obligatorio.',
      });
    });

    it('takes the first message of an array payload', () => {
      const exception = new BadRequestException({ message: ['primero', 'segundo'] });
      expect(filter.toBody(exception).message).toBe('primero');
    });

    it('falls back when the payload carries no readable message', () => {
      const exception = new HttpException({ message: [42] }, HttpStatus.BAD_REQUEST);
      expect(filter.toBody(exception).message).toBe('Los datos enviados no son válidos.');
      const noMessage = new HttpException({ detail: 'x' }, HttpStatus.CONFLICT);
      expect(filter.toBody(noMessage)).toEqual({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'El registro entra en conflicto con otro existente.',
      });
    });

    it('uses a plain string response as message', () => {
      const exception = new HttpException('Operación bloqueada.', HttpStatus.METHOD_NOT_ALLOWED);
      expect(filter.toBody(exception)).toEqual({
        statusCode: 405,
        code: 'OPERATION_NOT_ALLOWED',
        message: 'Operación bloqueada.',
      });
    });

    it.each([
      [
        new UnauthorizedException('jwt expired'),
        401,
        'UNAUTHORIZED',
        'Tu sesión terminó. Vuelve a iniciar sesión.',
      ],
      [
        new ForbiddenException('Forbidden resource'),
        403,
        'FORBIDDEN',
        'Tu rol no tiene acceso a este módulo.',
      ],
      [
        new NotFoundException('Cannot GET /x'),
        404,
        'NOT_FOUND',
        'El recurso solicitado no existe.',
      ],
      [new ConflictException('Ya existe.'), 409, 'CONFLICT', 'Ya existe.'],
      [new PayloadTooLargeException(), 413, 'PAYLOAD_TOO_LARGE', 'El archivo supera 1 MB.'],
      [
        new ThrottlerException(),
        429,
        'TOO_MANY_REQUESTS',
        'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
      ],
      [
        new HttpException('I am a teapot', 418),
        418,
        'HTTP_ERROR',
        'La solicitud no se pudo procesar.',
      ],
    ])('maps %s to %i %s', (exception, statusCode, code, message) => {
      expect(filter.toBody(exception)).toEqual({ statusCode, code, message });
    });

    it('hides details of 5xx HTTP exceptions and logs them', () => {
      expect(filter.toBody(new ServiceUnavailableException('db down'))).toEqual({
        ...INTERNAL,
        statusCode: 503,
      });
      expect(logError).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown errors', () => {
    it('returns a generic 500 and logs the stack', () => {
      const error = new Error('connection reset');
      expect(filter.toBody(error)).toEqual(INTERNAL);
      expect(logError).toHaveBeenCalledWith(error.stack);
    });

    it('logs the message when there is no stack', () => {
      const error = new Error('no stack');
      delete error.stack;
      filter.toBody(error);
      expect(logError).toHaveBeenCalledWith('no stack');
    });

    it('handles thrown non-Error values', () => {
      expect(filter.toBody('boom')).toEqual(INTERNAL);
      expect(logError).toHaveBeenCalledWith('boom');
    });
  });

  it('writes the body with its status code', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundError(), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'El registro ya no existe.',
    });
  });
});
