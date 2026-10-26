import type { AuditEntry } from '../../domain/ports/audit-logger.port';
import { recordAudit } from './record-audit';

describe('recordAudit', () => {
  it('writes the entry of the module with the acting user', async () => {
    const entries: AuditEntry[] = [];
    const audit = {
      record: (entry: AuditEntry) => {
        entries.push(entry);
        return Promise.resolve();
      },
    };

    await recordAudit(
      audit,
      'compras',
      { id: 'u1', name: 'Ana' },
      'ordenes-compra',
      'Registró',
      'OC-00001',
    );

    expect(entries).toEqual([
      {
        actor: { userId: 'u1', userName: 'Ana' },
        module: 'compras',
        resource: 'ordenes-compra',
        action: 'Registró',
        reference: 'OC-00001',
      },
    ]);
  });
});
