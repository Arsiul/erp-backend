import { BUYER, ComprasWorld, TODAY } from '../../../../test/support/compras/compras-doubles';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';

describe('PayablesUseCases', () => {
  let world: ComprasWorld;
  let payableId: string;

  beforeEach(async () => {
    world = new ComprasWorld();
    await world.invoices.create(
      { documentNumber: 'E001-5', supplierId: 's1', subtotal: 100, issuedAt: '2026-09-01' },
      BUYER,
    );
    payableId = [...world.payableRows.rows.keys()][0] ?? '';
  });

  it('lists with Lima today so overdue can be filtered', async () => {
    const result = await world.payables.list({ status: 'overdue', supplierId: ' s1 ', page: 1 });

    expect(result).toMatchObject({ total: 1, paged: true });
    expect(result.items[0]).toMatchObject({
      documentNumber: 'E001-5',
      dueAt: '2026-10-01',
      amount: 118,
      paidAmount: 0,
      balance: 118,
      status: 'pending',
    });
    expect(world.payableRows.lastCriteria).toMatchObject({
      status: 'overdue',
      supplierId: 's1',
      today: TODAY,
    });
    await expect(world.payables.list({})).resolves.toMatchObject({ paged: false });
  });

  it('gets one payable or answers 404', async () => {
    await expect(world.payables.get(payableId)).resolves.toMatchObject({ id: payableId });
    await expect(world.payables.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('has no actions: any action answers 404', async () => {
    await expect(world.payables.runAction(payableId, 'cancel')).rejects.toThrow(
      'La acción no existe para este registro.',
    );
    await expect(world.payables.runAction('nope', 'cancel')).rejects.toBeInstanceOf(NotFoundError);
  });
});
