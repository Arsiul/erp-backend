import type { PrismaService } from '../../../src/shared/infrastructure/prisma/prisma.service';

/** Masters that the compras suites buy against; ids match the unit doubles. */
export async function seedComprasMasters(prisma: PrismaService): Promise<void> {
  await prisma.category.create({ data: { id: 'cat-1', code: 'C1', name: 'Periféricos' } });
  await prisma.product.createMany({
    data: [
      {
        id: 'p1',
        sku: 'TEC-1',
        name: 'Teclado',
        categoryId: 'cat-1',
        unit: 'und',
        salePrice: 80,
        costPrice: 50,
      },
      {
        id: 'p2',
        sku: 'MOU-1',
        name: 'Mouse',
        categoryId: 'cat-1',
        unit: 'und',
        salePrice: 35,
        costPrice: 20,
      },
    ],
  });
  await prisma.warehouse.createMany({
    data: [
      { id: 'w1', code: 'W1', name: 'Almacén Central' },
      { id: 'w-off', code: 'W9', name: 'Almacén Cerrado', status: 'inactive' },
    ],
  });
  await prisma.supplier.createMany({
    data: [
      {
        id: 's1',
        code: 'PRV-1',
        name: 'Distribuidora Andina',
        ruc: '20100000001',
        paymentDays: 30,
      },
      { id: 's2', code: 'PRV-2', name: 'Importaciones Lima', ruc: '20100000002', paymentDays: 0 },
    ],
  });
}
