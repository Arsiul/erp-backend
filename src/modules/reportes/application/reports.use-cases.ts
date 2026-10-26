import { Inject, Injectable } from '@nestjs/common';
import { todayOf } from '../../../shared/application/clock/today';
import { INVALID_DATE, optionalId } from '../../../shared/application/listing/list-query';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { isIsoDay } from '../../../shared/domain/time/lima-time';
import {
  type PartyKind,
  REPORT_PARTIES,
  REPORT_QUERIES,
  type ReportParties,
  type ReportQueries,
} from '../domain/ports/reportes.ports';
import {
  balancesReport,
  type BalanceSide,
  filterSpec,
  inventoryReport,
  isBalanceSide,
  isReportId,
  purchasesReport,
  type ReportFilterSpec,
  type ReportId,
  type ReportResult,
  ROW_LIMIT,
  salesReport,
} from '../domain/reports';

export const REPORT_NOT_FOUND = 'El reporte no existe.';
export const INVALID_RANGE = 'La fecha inicial no puede ser posterior a la final.';
export const INVALID_SIDE = 'El tipo de saldo no es válido.';
export const TOO_MANY_ROWS = 'El reporte supera las 10 000 filas; acota los filtros.';

export const MISSING_PARTY: Readonly<Record<PartyKind, string>> = {
  customer: 'El cliente no existe.',
  supplier: 'El proveedor no existe.',
  warehouse: 'El almacén no existe.',
};

/** Query string of a report; empty values mean "no filter". */
export interface ReportInput {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly party?: string | undefined;
}

interface Range {
  readonly from?: string;
  readonly to?: string;
}

const PARTY_KIND: Readonly<Record<Exclude<ReportId, 'saldos'>, PartyKind>> = {
  ventas: 'customer',
  compras: 'supplier',
  inventario: 'warehouse',
};

/** One more row than allowed, to tell a full report from an overflowing one. */
const FETCH_LIMIT = ROW_LIMIT + 1;

@Injectable()
export class ReportsUseCases {
  constructor(
    @Inject(REPORT_QUERIES) private readonly queries: ReportQueries,
    @Inject(REPORT_PARTIES) private readonly parties: ReportParties,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async run(report: string, input: ReportInput): Promise<ReportResult> {
    const id = reportIdOf(report);
    const party = optionalId(input.party);
    switch (id) {
      case 'ventas': {
        const criteria = { ...rangeOf(input), ...(await this.partyFilter('customer', party)) };
        return salesReport(capped(await this.queries.sales({ ...criteria, limit: FETCH_LIMIT })));
      }
      case 'compras': {
        const criteria = { ...rangeOf(input), ...(await this.partyFilter('supplier', party)) };
        return purchasesReport(
          capped(await this.queries.purchases({ ...criteria, limit: FETCH_LIMIT })),
        );
      }
      case 'inventario': {
        const filter = await this.partyFilter('warehouse', party);
        const data = await this.queries.inventory({
          ...(filter.partyId === undefined ? {} : { warehouseId: filter.partyId }),
          limit: FETCH_LIMIT,
        });
        return inventoryReport(capped(data));
      }
      case 'saldos': {
        const range = rangeOf(input);
        const side = sideOf(party);
        const today = todayOf(this.clock);
        const data = await this.queries.balances({
          ...range,
          ...(side === undefined ? {} : { side }),
          today,
          limit: FETCH_LIMIT,
        });
        return balancesReport(capped(data), today);
      }
    }
  }

  async filters(report: string): Promise<ReportFilterSpec> {
    const id = reportIdOf(report);
    return filterSpec(id, id === 'saldos' ? [] : await this.parties.options(PARTY_KIND[id]));
  }

  private async partyFilter(
    kind: PartyKind,
    id: string | undefined,
  ): Promise<{ partyId?: string }> {
    if (id === undefined) {
      return {};
    }
    if (!(await this.parties.exists(kind, id))) {
      throw new BusinessError(MISSING_PARTY[kind]);
    }
    return { partyId: id };
  }
}

function reportIdOf(report: string): ReportId {
  if (!isReportId(report)) {
    throw new NotFoundError(REPORT_NOT_FOUND);
  }
  return report;
}

function dayOf(value: string | undefined): string | undefined {
  const day = optionalId(value);
  if (day !== undefined && !isIsoDay(day)) {
    throw new BusinessError(INVALID_DATE);
  }
  return day;
}

function rangeOf(input: ReportInput): Range {
  const from = dayOf(input.from);
  const to = dayOf(input.to);
  if (from !== undefined && to !== undefined && from > to) {
    throw new BusinessError(INVALID_RANGE);
  }
  return { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) };
}

function sideOf(value: string | undefined): BalanceSide | undefined {
  if (value !== undefined && !isBalanceSide(value)) {
    throw new BusinessError(INVALID_SIDE);
  }
  return value;
}

function capped<T extends { readonly rows: readonly unknown[] }>(data: T): T {
  if (data.rows.length > ROW_LIMIT) {
    throw new BusinessError(TOO_MANY_ROWS);
  }
  return data;
}
