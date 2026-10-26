import { SETTINGS_ID } from '../../../shared/infrastructure/prisma/settings-row';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { Prisma, type Settings as SettingsRow } from '../../../generated/prisma/client';
import type { SettingsRepository } from '../domain/ports/settings.repository';
import type { Settings } from '../domain/settings';

/** The company settings live in the single row with id 1. */

const toSettings = (row: SettingsRow): Settings => ({
  companyName: row.companyName,
  ruc: row.ruc,
  address: row.address,
  phone: row.phone,
  email: row.email,
  igvRate: row.igvRate.toNumber(),
  invoiceSeries: row.invoiceSeries,
  receiptSeries: row.receiptSeries,
  creditNoteSeries: row.creditNoteSeries,
  quoteValidityDays: row.quoteValidityDays,
});

@Injectable()
export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async get(): Promise<Settings | null> {
    const row = await this.host.client.settings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? toSettings(row) : null;
  }

  async save(settings: Settings): Promise<Settings> {
    const data = { ...settings, igvRate: new Prisma.Decimal(settings.igvRate) };
    const row = await this.host.client.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return toSettings(row);
  }
}
