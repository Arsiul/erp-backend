import { CREATED_ACTION, REMOVED_ACTION, UPDATED_ACTION } from './audit-actions';

describe('audit actions', () => {
  it('names the generic actions in Spanish', () => {
    expect([CREATED_ACTION, UPDATED_ACTION, REMOVED_ACTION]).toEqual([
      'Registró',
      'Actualizó',
      'Eliminó',
    ]);
  });
});
