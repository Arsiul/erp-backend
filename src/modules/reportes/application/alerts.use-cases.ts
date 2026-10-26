import { Inject, Injectable } from '@nestjs/common';
import { todayOf } from '../../../shared/application/clock/today';
import { hasAccess, type Permissions } from '../../../shared/domain/authorization/access-level';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { buildAlerts, type BusinessAlert } from '../domain/alerts';
import { ALERT_QUERIES, type AlertQueries } from '../domain/ports/reportes.ports';

@Injectable()
export class AlertsUseCases {
  constructor(
    @Inject(ALERT_QUERIES) private readonly queries: AlertQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Alerts of the modules the role can read; the others are not even queried. */
  async list(permissions: Permissions): Promise<BusinessAlert[]> {
    const today = todayOf(this.clock);
    const reads = (module: 'comercial' | 'compras' | 'inventario'): boolean =>
      hasAccess(permissions, module, 'read');

    const [commercial, purchasing, inventory] = await Promise.all([
      reads('comercial') ? this.queries.commercial(today) : undefined,
      reads('compras') ? this.queries.purchasing(today) : undefined,
      reads('inventario') ? this.queries.inventory() : undefined,
    ]);

    return buildAlerts({
      ...(commercial ? { commercial } : {}),
      ...(purchasing ? { purchasing } : {}),
      ...(inventory ? { inventory } : {}),
    });
  }
}
