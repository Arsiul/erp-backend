export const SEQUENCE_GENERATOR = Symbol('SequenceGenerator');

/**
 * Atomic counters (`clientes`, `ventas`, `serie:F001`, ...). `next` locks the row, so it
 * must run inside a UnitOfWork: if the transaction rolls back, the number is not consumed.
 */
export interface SequenceGenerator {
  next(key: string): Promise<number>;
}
