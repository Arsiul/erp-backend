import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type DomainErrorKind } from '../../domain/errors/domain-error';
import { ERROR_TRANSLATOR, type ErrorTranslator } from '../../domain/ports/error-translator.port';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

const DOMAIN_STATUS: Record<DomainErrorKind, number> = {
  business: HttpStatus.UNPROCESSABLE_ENTITY,
  'not-found': HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  forbidden: HttpStatus.FORBIDDEN,
  unauthorized: HttpStatus.UNAUTHORIZED,
  'operation-not-allowed': HttpStatus.METHOD_NOT_ALLOWED,
};

interface HttpFallback {
  code: string;
  message: string;
  /** When true, the message carried by the exception is shown instead of the fallback. */
  useOwnMessage?: boolean;
}

const HTTP_FALLBACKS: Partial<Record<number, HttpFallback>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'VALIDATION_ERROR',
    message: 'Los datos enviados no son válidos.',
    useOwnMessage: true,
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Tu rol no tiene acceso a este módulo.' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'OPERATION_NOT_ALLOWED',
    message: 'La operación no está permitida.',
    useOwnMessage: true,
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: 'El registro entra en conflicto con otro existente.',
    useOwnMessage: true,
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: { code: 'PAYLOAD_TOO_LARGE', message: 'El archivo supera 1 MB.' },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  },
};

const GENERIC_CLIENT_ERROR: HttpFallback = {
  code: 'HTTP_ERROR',
  message: 'La solicitud no se pudo procesar.',
};

const INTERNAL_ERROR: ErrorBody = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL_ERROR',
  message: 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.',
};

/** Extracts the first human-readable message carried by an HttpException response. */
function ownMessage(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message: unknown = (response as { message?: unknown }).message;
  if (Array.isArray(message)) {
    const first: unknown = message[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof message === 'string' ? message : undefined;
}

/**
 * Single translation point from errors to the public `{ statusCode, code, message }` contract.
 * Adapter failures with a meaning for the user arrive as domain errors through `ErrorTranslator`.
 * Stack traces never reach the client.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(@Inject(ERROR_TRANSLATOR) private readonly translator: ErrorTranslator) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception);
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    const domainError =
      exception instanceof DomainError ? exception : this.translator.translate(exception);
    if (domainError) {
      return {
        statusCode: DOMAIN_STATUS[domainError.kind],
        code: domainError.code,
        message: domainError.message,
      };
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    return INTERNAL_ERROR;
  }

  private fromHttpException(exception: HttpException): ErrorBody {
    const statusCode = exception.getStatus();
    if (statusCode >= 500) {
      this.logger.error(exception.stack ?? exception.message);
      return { ...INTERNAL_ERROR, statusCode };
    }
    const fallback = HTTP_FALLBACKS[statusCode] ?? GENERIC_CLIENT_ERROR;
    const message = fallback.useOwnMessage ? ownMessage(exception) : undefined;
    return { statusCode, code: fallback.code, message: message ?? fallback.message };
  }
}
