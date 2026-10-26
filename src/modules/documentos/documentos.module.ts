import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { PrismaTransactionHost } from '../../shared/infrastructure/prisma/prisma-transaction-host';
import { AuthModule } from '../auth/auth.module';
import { DocumentsUseCases } from './application/documents.use-cases';
import { DOCUMENT_REPOSITORY, LINKED_RECORDS } from './domain/ports/document.repository';
import { STORAGE_DRIVER, type StorageDriver } from './domain/ports/storage-driver.port';
import { DatabaseStorageDriver } from './infrastructure/database-storage.driver';
import { DiskStorageDriver } from './infrastructure/disk-storage.driver';
import { PrismaDocumentRepository } from './infrastructure/prisma-document.repository';
import { PrismaLinkedRecords } from './infrastructure/prisma-linked-records';
import { DocumentsController } from './presentation/documents.controller';

/** `STORAGE_DRIVER=disk` keeps the bytes under `UPLOAD_DIR` (development only). */
const storageDriverFactory = (config: AppConfig, host: PrismaTransactionHost): StorageDriver =>
  config.storage.driver === 'disk'
    ? new DiskStorageDriver(config.storage.uploadDir)
    : new DatabaseStorageDriver(host);

/** Documents attached to any record, with their file behind a storage driver. */
@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: LINKED_RECORDS, useClass: PrismaLinkedRecords },
    {
      provide: STORAGE_DRIVER,
      useFactory: storageDriverFactory,
      inject: [AppConfig, PrismaTransactionHost],
    },
    DocumentsUseCases,
  ],
})
export class DocumentosModule {}
