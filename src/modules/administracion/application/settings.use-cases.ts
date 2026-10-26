import { Inject, Injectable } from '@nestjs/common';
import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import { UPDATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { SETTINGS_REPOSITORY, type SettingsRepository } from '../domain/ports/settings.repository';
import {
  type Settings,
  type SettingsInput,
  SETTINGS_REFERENCE,
  SETTINGS_RESOURCE,
  validateSettings,
} from '../domain/settings';
import type { ActingUser } from '../../../shared/application/listing/list-query';

export const SETTINGS_MISSING = 'La configuración de la empresa no está registrada.';

/** Company settings: a single record, replaced as a whole by `PUT /settings`. */
@Injectable()
export class SettingsUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SETTINGS_REPOSITORY) private readonly settings: SettingsRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async get(): Promise<Settings> {
    const settings = await this.settings.get();
    if (settings === null) {
      throw new NotFoundError(SETTINGS_MISSING);
    }
    return settings;
  }

  save(input: SettingsInput, actor: ActingUser): Promise<Settings> {
    return this.uow.run(async () => {
      const saved = await this.settings.save(validateSettings(input));
      await this.audit.record({
        actor: actorOf(actor),
        module: 'administracion',
        resource: SETTINGS_RESOURCE,
        action: UPDATED_ACTION,
        reference: SETTINGS_REFERENCE,
      });
      return saved;
    });
  }
}
