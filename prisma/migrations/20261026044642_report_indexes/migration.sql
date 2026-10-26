-- DropIndex
DROP INDEX "kardex_entries_origin_idx";

-- DropIndex
DROP INDEX "quotes_status_idx";

-- DropIndex
DROP INDEX "sales_status_idx";

-- DropIndex
DROP INDEX "supplier_invoices_status_idx";

-- CreateIndex
CREATE INDEX "kardex_entries_origin_date_idx" ON "kardex_entries"("origin", "date");

-- CreateIndex
CREATE INDEX "quotes_status_valid_until_idx" ON "quotes"("status", "valid_until");

-- CreateIndex
CREATE INDEX "sales_status_issued_at_idx" ON "sales"("status", "issued_at");

-- CreateIndex
CREATE INDEX "supplier_invoices_status_issued_at_idx" ON "supplier_invoices"("status", "issued_at");

-- Partial indexes (Prisma cannot express them): open balances by due date, for the aging
-- report and the overdue and due-soon figures of the dashboard and the alerts.
CREATE INDEX "receivables_due_at_open_idx" ON "receivables"("due_at") WHERE "balance" > 0;
CREATE INDEX "payables_due_at_open_idx" ON "payables"("due_at") WHERE "balance" > 0;
