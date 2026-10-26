import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { PartyKind, ReportParties } from '../domain/ports/reportes.ports';
import type { FilterOption } from '../domain/reports';

/** Static table of each party kind; never built from the request. */
const TABLES: Readonly<Record<PartyKind, Prisma.Sql>> = {
  customer: Prisma.sql`customers`,
  supplier: Prisma.sql`suppliers`,
  warehouse: Prisma.sql`warehouses`,
};

@Injectable()
export class PrismaReportParties implements ReportParties {
  constructor(private readonly host: PrismaTransactionHost) {}

  async exists(kind: PartyKind, id: string): Promise<boolean> {
    const [row] = await this.host.client.$queryRaw<{ found: boolean }[]>(
      Prisma.sql`SELECT EXISTS (SELECT 1 FROM ${TABLES[kind]} WHERE id = ${id}) AS "found"`,
    );
    return row?.found === true;
  }

  options(kind: PartyKind): Promise<FilterOption[]> {
    return this.host.client.$queryRaw<FilterOption[]>(
      Prisma.sql`SELECT id AS "value", name AS "label" FROM ${TABLES[kind]} ORDER BY name ASC, id ASC`,
    );
  }
}
