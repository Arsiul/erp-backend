import { Module } from '@nestjs/common';
import { ComercialModule } from '../comercial/comercial.module';
import { ComprasModule } from '../compras/compras.module';
import { MaestrosModule } from '../maestros/maestros.module';
import { TransferUseCases } from './application/transfer.use-cases';
import { TransferController } from './presentation/transfer.controller';

/** CSV import/export per module; imports go through each module's own use cases. */
@Module({
  imports: [MaestrosModule, ComercialModule, ComprasModule],
  controllers: [TransferController],
  providers: [TransferUseCases],
})
export class TransferenciaModule {}
