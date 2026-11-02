-- AlterEnum
ALTER TYPE "purchase_order_status" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "cancel_reason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "cancel_reason" TEXT NOT NULL DEFAULT '';
