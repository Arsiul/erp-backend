import { Module } from '@nestjs/common';
import { CreditNotesUseCases } from './application/credit-notes.use-cases';
import { InvoicesUseCases } from './application/invoices.use-cases';
import { QuotesUseCases } from './application/quotes.use-cases';
import { ReceivablesUseCases } from './application/receivables.use-cases';
import { SalesUseCases } from './application/sales.use-cases';
import { COMMERCIAL_LOOKUPS } from './domain/ports/commercial-lookups.port';
import {
  CREDIT_NOTE_REPOSITORY,
  INVOICE_REPOSITORY,
  QUOTE_REPOSITORY,
  RECEIVABLE_REPOSITORY,
  SALE_REPOSITORY,
} from './domain/ports/commercial-repositories.port';
import { PrismaCommercialLookups } from './infrastructure/prisma-commercial-lookups';
import { PrismaCreditNoteRepository } from './infrastructure/prisma-credit-note.repository';
import { PrismaInvoiceRepository } from './infrastructure/prisma-invoice.repository';
import { PrismaQuoteRepository } from './infrastructure/prisma-quote.repository';
import { PrismaReceivableRepository } from './infrastructure/prisma-receivable.repository';
import { PrismaSaleRepository } from './infrastructure/prisma-sale.repository';
import { CreditNotesController } from './presentation/credit-notes.controller';
import { InvoicesController } from './presentation/invoices.controller';
import { QuotesController } from './presentation/quotes.controller';
import { ReceivablesController } from './presentation/receivables.controller';
import { SalesController } from './presentation/sales.controller';

/** Quotes, sales, invoices, credit notes and receivables. Stock moves through STOCK_LEDGER. */
@Module({
  controllers: [
    QuotesController,
    SalesController,
    InvoicesController,
    CreditNotesController,
    ReceivablesController,
  ],
  providers: [
    { provide: QUOTE_REPOSITORY, useClass: PrismaQuoteRepository },
    { provide: SALE_REPOSITORY, useClass: PrismaSaleRepository },
    { provide: INVOICE_REPOSITORY, useClass: PrismaInvoiceRepository },
    { provide: CREDIT_NOTE_REPOSITORY, useClass: PrismaCreditNoteRepository },
    { provide: RECEIVABLE_REPOSITORY, useClass: PrismaReceivableRepository },
    { provide: COMMERCIAL_LOOKUPS, useClass: PrismaCommercialLookups },
    QuotesUseCases,
    SalesUseCases,
    InvoicesUseCases,
    CreditNotesUseCases,
    ReceivablesUseCases,
  ],
})
export class ComercialModule {}
