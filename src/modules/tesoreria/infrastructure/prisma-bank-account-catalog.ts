import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { BankAccountCatalog, CatalogAccount } from '../domain/ports/treasury.ports';

@Injectable()
export class PrismaBankAccountCatalog implements BankAccountCatalog {
  constructor(private readonly host: PrismaTransactionHost) {}

  findAccount(id: string): Promise<CatalogAccount | null> {
    return this.host.client.bankAccount.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
  }
}
