-- CreateEnum
CREATE TYPE "active_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "customer_document_type" AS ENUM ('RUC', 'DNI', 'CE');

-- CreateEnum
CREATE TYPE "quote_status" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'converted');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('pending_invoice', 'invoiced', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_term" AS ENUM ('cash', 'credit');

-- CreateEnum
CREATE TYPE "invoice_kind" AS ENUM ('factura', 'boleta');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('issued', 'cancelled');

-- CreateEnum
CREATE TYPE "credit_note_reason" AS ENUM ('return', 'discount', 'error');

-- CreateEnum
CREATE TYPE "balance_status" AS ENUM ('pending', 'partial', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "purchase_order_status" AS ENUM ('draft', 'approved', 'partial', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('pending_bill', 'billed', 'cancelled');

-- CreateEnum
CREATE TYPE "supplier_invoice_status" AS ENUM ('registered', 'cancelled');

-- CreateEnum
CREATE TYPE "kardex_origin" AS ENUM ('initial', 'sale', 'sale_cancel', 'credit_note', 'receipt', 'receipt_cancel', 'adjustment', 'transfer');

-- CreateEnum
CREATE TYPE "adjustment_type" AS ENUM ('increase', 'decrease');

-- CreateEnum
CREATE TYPE "adjustment_reason" AS ENUM ('count', 'damage', 'expired', 'loss', 'other');

-- CreateEnum
CREATE TYPE "transfer_status" AS ENUM ('pending', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "movement_concept" AS ENUM ('collection', 'payment', 'other');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('transfer', 'deposit', 'cash', 'check', 'wallet');

-- CreateEnum
CREATE TYPE "movement_status" AS ENUM ('posted', 'voided');

-- CreateEnum
CREATE TYPE "document_category" AS ENUM ('contract', 'invoice', 'guide', 'order', 'other');

-- CreateEnum
CREATE TYPE "module_id" AS ENUM ('maestros', 'comercial', 'compras', 'inventario', 'tesoreria', 'documentos', 'reportes', 'administracion');

-- CreateEnum
CREATE TYPE "access_level" AS ENUM ('none', 'read', 'write');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document_type" "customer_document_type" NOT NULL,
    "document_number" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "payment_days" INTEGER NOT NULL DEFAULT 0,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sale_price" DECIMAL(14,2) NOT NULL,
    "cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "manager" TEXT NOT NULL DEFAULT '',
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "bank" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "seller" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "igv" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "quote_status" NOT NULL DEFAULT 'draft',
    "sale_number" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "quote_id" TEXT,
    "quote_number" TEXT NOT NULL DEFAULT '',
    "issued_at" DATE NOT NULL,
    "seller" TEXT NOT NULL,
    "payment_term" "payment_term" NOT NULL DEFAULT 'cash',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "igv" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "sale_status" NOT NULL DEFAULT 'pending_invoice',
    "invoice_id" TEXT,
    "invoice_number" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "kind" "invoice_kind" NOT NULL,
    "number" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_document" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "due_at" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "igv" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "credited_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "invoice_status" NOT NULL DEFAULT 'issued',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "reason" "credit_note_reason" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "igv" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "due_at" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credited_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL,
    "status" "balance_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "expected_at" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "igv" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "purchase_order_status" NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "purchase_order_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "received_at" DATE NOT NULL,
    "guide_number" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "status" "receipt_status" NOT NULL DEFAULT 'pending_bill',
    "supplier_invoice_number" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_lines" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "document_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "receipt_id" TEXT,
    "receipt_number" TEXT NOT NULL DEFAULT '',
    "issued_at" DATE NOT NULL,
    "due_at" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "igv" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "supplier_invoice_status" NOT NULL DEFAULT 'registered',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "supplier_invoice_id" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "due_at" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL,
    "status" "balance_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kardex_entries" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "origin" "kardex_origin" NOT NULL,
    "reference" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kardex_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "type" "adjustment_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "adjustment_reason" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "origin_warehouse_id" TEXT NOT NULL,
    "origin_warehouse_name" TEXT NOT NULL,
    "destination_warehouse_id" TEXT NOT NULL,
    "destination_warehouse_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "transfer_status" NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "account_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "type" "movement_type" NOT NULL,
    "concept" "movement_concept" NOT NULL,
    "receivable_id" TEXT,
    "payable_id" TEXT,
    "counterparty" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "method" "payment_method" NOT NULL DEFAULT 'transfer',
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "movement_status" NOT NULL DEFAULT 'posted',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_documents" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "document_category" NOT NULL DEFAULT 'other',
    "linked_resource" TEXT,
    "linked_id" TEXT,
    "linked_label" TEXT NOT NULL DEFAULT '',
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "content" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMP(0) NOT NULL,
    "uploaded_by_id" TEXT,
    "uploaded_by" TEXT NOT NULL,

    CONSTRAINT "stored_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "module" "module_id" NOT NULL,
    "access" "access_level" NOT NULL DEFAULT 'none',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","module")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "status" "active_status" NOT NULL DEFAULT 'active',
    "last_access_at" TIMESTAMP(0),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(0),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',
    "user_agent" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "date" TIMESTAMP(0) NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT NOT NULL,
    "module" "module_id" NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unseen_records" (
    "user_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unseen_records_pkey" PRIMARY KEY ("user_id","resource","record_id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "company_name" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "igv_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "invoice_series" TEXT NOT NULL,
    "receipt_series" TEXT NOT NULL,
    "credit_note_series" TEXT NOT NULL,
    "quote_validity_days" INTEGER NOT NULL DEFAULT 15,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_ruc_key" ON "suppliers"("ruc");

-- CreateIndex
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE INDEX "categories_status_idx" ON "categories"("status");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_status_idx" ON "warehouses"("status");

-- CreateIndex
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_issued_at_idx" ON "quotes"("issued_at");

-- CreateIndex
CREATE INDEX "quote_lines_product_id_idx" ON "quote_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_quote_id_product_id_key" ON "quote_lines"("quote_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_id_key" ON "sales"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_warehouse_id_idx" ON "sales"("warehouse_id");

-- CreateIndex
CREATE INDEX "sales_quote_id_idx" ON "sales"("quote_id");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_issued_at_idx" ON "sales"("issued_at");

-- CreateIndex
CREATE INDEX "sales_customer_id_payment_term_status_idx" ON "sales"("customer_id", "payment_term", "status");

-- CreateIndex
CREATE INDEX "sale_lines_product_id_idx" ON "sale_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_lines_sale_id_product_id_key" ON "sale_lines"("sale_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_sale_id_idx" ON "invoices"("sale_id");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE INDEX "invoices_warehouse_id_idx" ON "invoices"("warehouse_id");

-- CreateIndex
CREATE INDEX "invoices_kind_idx" ON "invoices"("kind");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_issued_at_idx" ON "invoices"("issued_at");

-- CreateIndex
CREATE INDEX "invoice_lines_product_id_idx" ON "invoice_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_product_id_key" ON "invoice_lines"("invoice_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE INDEX "credit_notes_customer_id_idx" ON "credit_notes"("customer_id");

-- CreateIndex
CREATE INDEX "credit_notes_warehouse_id_idx" ON "credit_notes"("warehouse_id");

-- CreateIndex
CREATE INDEX "credit_notes_issued_at_idx" ON "credit_notes"("issued_at");

-- CreateIndex
CREATE INDEX "credit_note_lines_product_id_idx" ON "credit_note_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_lines_credit_note_id_product_id_key" ON "credit_note_lines"("credit_note_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_invoice_id_key" ON "receivables"("invoice_id");

-- CreateIndex
CREATE INDEX "receivables_customer_id_status_idx" ON "receivables"("customer_id", "status");

-- CreateIndex
CREATE INDEX "receivables_status_idx" ON "receivables"("status");

-- CreateIndex
CREATE INDEX "receivables_due_at_idx" ON "receivables"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_warehouse_id_idx" ON "purchase_orders"("warehouse_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_issued_at_idx" ON "purchase_orders"("issued_at");

-- CreateIndex
CREATE INDEX "purchase_order_lines_product_id_idx" ON "purchase_order_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_product_id_key" ON "purchase_order_lines"("purchase_order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE INDEX "receipts_purchase_order_id_status_idx" ON "receipts"("purchase_order_id", "status");

-- CreateIndex
CREATE INDEX "receipts_supplier_id_idx" ON "receipts"("supplier_id");

-- CreateIndex
CREATE INDEX "receipts_warehouse_id_idx" ON "receipts"("warehouse_id");

-- CreateIndex
CREATE INDEX "receipts_status_idx" ON "receipts"("status");

-- CreateIndex
CREATE INDEX "receipts_received_at_idx" ON "receipts"("received_at");

-- CreateIndex
CREATE INDEX "receipt_lines_product_id_idx" ON "receipt_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_lines_receipt_id_product_id_key" ON "receipt_lines"("receipt_id", "product_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_supplier_id_document_number_idx" ON "supplier_invoices"("supplier_id", "document_number");

-- CreateIndex
CREATE INDEX "supplier_invoices_receipt_id_idx" ON "supplier_invoices"("receipt_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_status_idx" ON "supplier_invoices"("status");

-- CreateIndex
CREATE INDEX "supplier_invoices_issued_at_idx" ON "supplier_invoices"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "payables_supplier_invoice_id_key" ON "payables"("supplier_invoice_id");

-- CreateIndex
CREATE INDEX "payables_supplier_id_status_idx" ON "payables"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "payables_status_idx" ON "payables"("status");

-- CreateIndex
CREATE INDEX "payables_due_at_idx" ON "payables"("due_at");

-- CreateIndex
CREATE INDEX "stock_items_warehouse_id_idx" ON "stock_items"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_product_id_warehouse_id_key" ON "stock_items"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "kardex_entries_product_id_warehouse_id_seq_idx" ON "kardex_entries"("product_id", "warehouse_id", "seq");

-- CreateIndex
CREATE INDEX "kardex_entries_warehouse_id_idx" ON "kardex_entries"("warehouse_id");

-- CreateIndex
CREATE INDEX "kardex_entries_reference_idx" ON "kardex_entries"("reference");

-- CreateIndex
CREATE INDEX "kardex_entries_origin_idx" ON "kardex_entries"("origin");

-- CreateIndex
CREATE INDEX "kardex_entries_date_idx" ON "kardex_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_number_key" ON "stock_adjustments"("number");

-- CreateIndex
CREATE INDEX "stock_adjustments_product_id_idx" ON "stock_adjustments"("product_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_warehouse_id_idx" ON "stock_adjustments"("warehouse_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_date_idx" ON "stock_adjustments"("date");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_number_key" ON "transfers"("number");

-- CreateIndex
CREATE INDEX "transfers_product_id_idx" ON "transfers"("product_id");

-- CreateIndex
CREATE INDEX "transfers_origin_warehouse_id_idx" ON "transfers"("origin_warehouse_id");

-- CreateIndex
CREATE INDEX "transfers_destination_warehouse_id_idx" ON "transfers"("destination_warehouse_id");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfers_date_idx" ON "transfers"("date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_number_key" ON "cash_movements"("number");

-- CreateIndex
CREATE INDEX "cash_movements_account_id_idx" ON "cash_movements"("account_id");

-- CreateIndex
CREATE INDEX "cash_movements_receivable_id_idx" ON "cash_movements"("receivable_id");

-- CreateIndex
CREATE INDEX "cash_movements_payable_id_idx" ON "cash_movements"("payable_id");

-- CreateIndex
CREATE INDEX "cash_movements_type_idx" ON "cash_movements"("type");

-- CreateIndex
CREATE INDEX "cash_movements_status_idx" ON "cash_movements"("status");

-- CreateIndex
CREATE INDEX "cash_movements_date_idx" ON "cash_movements"("date");

-- CreateIndex
CREATE INDEX "stored_documents_linked_resource_linked_id_idx" ON "stored_documents"("linked_resource", "linked_id");

-- CreateIndex
CREATE INDEX "stored_documents_category_idx" ON "stored_documents"("category");

-- CreateIndex
CREATE INDEX "stored_documents_uploaded_by_id_idx" ON "stored_documents"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "stored_documents_uploaded_at_idx" ON "stored_documents"("uploaded_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions"("family_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_date_idx" ON "audit_logs"("resource", "date");

-- CreateIndex
CREATE INDEX "audit_logs_module_date_idx" ON "audit_logs"("module", "date");

-- CreateIndex
CREATE INDEX "audit_logs_date_idx" ON "audit_logs"("date");

-- CreateIndex
CREATE INDEX "unseen_records_resource_record_id_idx" ON "unseen_records"("resource", "record_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_invoice_id_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_entries" ADD CONSTRAINT "kardex_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_entries" ADD CONSTRAINT "kardex_entries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_origin_warehouse_id_fkey" FOREIGN KEY ("origin_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_documents" ADD CONSTRAINT "stored_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unseen_records" ADD CONSTRAINT "unseen_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Manual SQL (not expressible in schema.prisma) ──────────────────────────

-- Case-insensitive uniques
CREATE UNIQUE INDEX "customers_document_number_ci_key" ON "customers" (lower("document_number"));
CREATE UNIQUE INDEX "categories_name_ci_key" ON "categories" (lower("name"));
CREATE UNIQUE INDEX "warehouses_name_ci_key" ON "warehouses" (lower("name"));
CREATE UNIQUE INDEX "bank_accounts_account_number_ci_key" ON "bank_accounts" (lower("account_number"));
CREATE UNIQUE INDEX "roles_name_ci_key" ON "roles" (lower("name"));
CREATE UNIQUE INDEX "users_email_ci_key" ON "users" (lower("email"));
CREATE UNIQUE INDEX "products_sku_ci_key" ON "products" (lower("sku"));

-- Partial uniques (cancelled documents release the key)
CREATE UNIQUE INDEX "supplier_invoices_supplier_document_active_key" ON "supplier_invoices" ("supplier_id", lower("document_number")) WHERE "status" <> 'cancelled';
CREATE UNIQUE INDEX "invoices_sale_active_key" ON "invoices" ("sale_id") WHERE "status" <> 'cancelled';

-- Maestros
ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_days_check" CHECK ("credit_days" >= 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_limit_check" CHECK ("credit_limit" >= 0);
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_payment_days_check" CHECK ("payment_days" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_prices_check" CHECK ("sale_price" >= 0 AND "cost_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_check" CHECK ("min_stock" >= 0);
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_balance_check" CHECK ("balance" >= 0 AND "opening_balance" >= 0);

-- Document amounts
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_amounts_check" CHECK ("subtotal" >= 0 AND "igv" >= 0 AND "total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts_check" CHECK ("subtotal" >= 0 AND "igv" >= 0 AND "total" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_check" CHECK ("subtotal" >= 0 AND "igv" >= 0 AND "total" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_amount_check" CHECK ("credited_amount" >= 0 AND "credited_amount" <= "total");
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_amounts_check" CHECK ("subtotal" >= 0 AND "igv" >= 0 AND "total" >= 0);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_amounts_check" CHECK ("subtotal" >= 0 AND "igv" >= 0 AND "total" >= 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_subtotal_check" CHECK ("subtotal" >= 0);
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_amounts_check" CHECK ("subtotal" >= 0 AND "igv" >= 0 AND "total" >= 0);

-- Document lines
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_received_check" CHECK ("received_quantity" >= 0 AND "received_quantity" <= "quantity");
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0);

-- Balances
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_amounts_check" CHECK ("amount" >= 0 AND "paid_amount" >= 0 AND "credited_amount" >= 0 AND "balance" >= 0);
ALTER TABLE "payables" ADD CONSTRAINT "payables_amounts_check" CHECK ("amount" >= 0 AND "paid_amount" >= 0 AND "balance" >= 0);

-- Inventory
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_min_stock_check" CHECK ("min_stock" >= 0);
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_unit_cost_check" CHECK ("unit_cost" >= 0);
ALTER TABLE "kardex_entries" ADD CONSTRAINT "kardex_entries_balance_check" CHECK ("balance" >= 0 AND "unit_cost" >= 0);
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_warehouses_check" CHECK ("origin_warehouse_id" <> "destination_warehouse_id");

-- Treasury
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_check" CHECK ("amount" > 0);

-- Documents (content up to 1 MiB)
ALTER TABLE "stored_documents" ADD CONSTRAINT "stored_documents_file_size_check" CHECK ("file_size" BETWEEN 1 AND 1048576);

-- Administration
ALTER TABLE "users" ADD CONSTRAINT "users_failed_attempts_check" CHECK ("failed_attempts" >= 0);

-- Settings singleton and validations
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_igv_rate_check" CHECK ("igv_rate" >= 0 AND "igv_rate" <= 0.5);
ALTER TABLE "settings" ADD CONSTRAINT "settings_quote_validity_days_check" CHECK ("quote_validity_days" BETWEEN 1 AND 365);
ALTER TABLE "settings" ADD CONSTRAINT "settings_ruc_check" CHECK ("ruc" ~ '^[0-9]{11}$');
ALTER TABLE "settings" ADD CONSTRAINT "settings_series_check" CHECK ("invoice_series" ~ '^[A-Z][A-Z0-9]{3}$' AND "receipt_series" ~ '^[A-Z][A-Z0-9]{3}$' AND "credit_note_series" ~ '^[A-Z][A-Z0-9]{3}$');
