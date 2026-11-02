import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';

/** Body of `POST /:resource/:id/:action`; the use case decides whether the reason is required. */
export class ActionBodyDto {
  @ApiPropertyOptional({ description: 'Motivo de la anulación o el rechazo', maxLength: 500 })
  @Allow()
  readonly reason?: unknown;
}
