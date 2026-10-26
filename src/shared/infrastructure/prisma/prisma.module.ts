import { Module } from '@nestjs/common';
import { PrismaTransactionHost } from './prisma-transaction-host';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService, PrismaTransactionHost],
  exports: [PrismaService, PrismaTransactionHost],
})
export class PrismaModule {}
