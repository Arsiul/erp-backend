import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BankAccountsUseCases } from './application/bank-accounts.use-cases';
import { CategoriesUseCases } from './application/categories.use-cases';
import { CustomersUseCases } from './application/customers.use-cases';
import { ProductsUseCases } from './application/products.use-cases';
import { SuppliersUseCases } from './application/suppliers.use-cases';
import { WarehousesUseCases } from './application/warehouses.use-cases';
import { BANK_ACCOUNT_REPOSITORY } from './domain/ports/bank-account.repository';
import { CATEGORY_REPOSITORY } from './domain/ports/category.repository';
import { CUSTOMER_REPOSITORY } from './domain/ports/customer.repository';
import { PRODUCT_REPOSITORY } from './domain/ports/product.repository';
import { SUPPLIER_REPOSITORY } from './domain/ports/supplier.repository';
import { WAREHOUSE_REPOSITORY } from './domain/ports/warehouse.repository';
import { PrismaBankAccountRepository } from './infrastructure/prisma-bank-account.repository';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository';
import { PrismaCustomerRepository } from './infrastructure/prisma-customer.repository';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository';
import { PrismaSupplierRepository } from './infrastructure/prisma-supplier.repository';
import { PrismaWarehouseRepository } from './infrastructure/prisma-warehouse.repository';
import { BankAccountsController } from './presentation/bank-accounts.controller';
import { CategoriesController } from './presentation/categories.controller';
import { CustomersController } from './presentation/customers.controller';
import { ProductsController } from './presentation/products.controller';
import { SuppliersController } from './presentation/suppliers.controller';
import { WarehousesController } from './presentation/warehouses.controller';

/** Customers, suppliers, products, categories, warehouses and bank accounts. */
@Module({
  imports: [AuthModule],
  controllers: [
    CustomersController,
    SuppliersController,
    CategoriesController,
    ProductsController,
    WarehousesController,
    BankAccountsController,
  ],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
    { provide: BANK_ACCOUNT_REPOSITORY, useClass: PrismaBankAccountRepository },
    CustomersUseCases,
    SuppliersUseCases,
    CategoriesUseCases,
    ProductsUseCases,
    WarehousesUseCases,
    BankAccountsUseCases,
  ],
})
export class MaestrosModule {}
