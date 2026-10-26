import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/app-config';
import { AppConfigModule } from './config/app-config.module';
import { AdministracionModule } from './modules/administracion/administracion.module';
import { AuditLoggingModule } from './modules/administracion/audit-logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { BankLedgerModule } from './modules/tesoreria/bank-ledger.module';
import { ComercialModule } from './modules/comercial/comercial.module';
import { ReceivableLedgerModule } from './modules/comercial/receivable-ledger.module';
import { ComprasModule } from './modules/compras/compras.module';
import { PayableLedgerModule } from './modules/compras/payable-ledger.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { StockLedgerModule } from './modules/inventario/stock-ledger.module';
import { MaestrosModule } from './modules/maestros/maestros.module';
import { TesoreriaModule } from './modules/tesoreria/tesoreria.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { JwtAuthGuard } from './modules/auth/presentation/jwt-auth.guard';
import { HealthModule } from './shared/health.module';
import { PermissionGuard } from './shared/presentation/auth/permission.guard';
import { GlobalExceptionFilter } from './shared/presentation/filters/global-exception.filter';
import { validationExceptionFactory } from './shared/presentation/validation/validation-exception.factory';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    AppConfigModule,
    SharedModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.throttle.ttlMs, limit: config.throttle.limit }],
      }),
    }),
    HealthModule,
    AuditLoggingModule,
    AuthModule,
    AdministracionModule,
    StockLedgerModule,
    BankLedgerModule,
    ReceivableLedgerModule,
    PayableLedgerModule,
    MaestrosModule,
    DocumentosModule,
    ComercialModule,
    ComprasModule,
    InventarioModule,
    TesoreriaModule,
    ReportesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          exceptionFactory: validationExceptionFactory,
        }),
    },
  ],
})
export class AppModule {}
