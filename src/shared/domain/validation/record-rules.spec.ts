import {
  requireActive,
  requireActiveRecord,
  requireFound,
  requireId,
  requireRecord,
} from './record-rules';

const ACTIVE = { id: 'c1', status: 'active' };
const INACTIVE = { id: 'c2', status: 'inactive' };
const INACTIVE_MESSAGE = 'No puedes usar el cliente porque está en estado inactivo.';

describe('record rules', () => {
  it('requires a non empty text id', () => {
    expect(requireId('c1', 'el cliente')).toBe('c1');
    for (const value of ['', undefined, 7]) {
      expect(() => requireId(value, 'el cliente')).toThrow('Selecciona el cliente.');
    }
  });

  it('requires the record to exist', () => {
    expect(requireFound(ACTIVE, 'el cliente')).toBe(ACTIVE);
    expect(() => requireFound(null, 'el cliente')).toThrow('Selecciona el cliente.');
  });

  it('requires the record to be active', () => {
    expect(requireActive(ACTIVE, 'el cliente')).toBe(ACTIVE);
    expect(() => requireActive(null, 'el cliente')).toThrow('Selecciona el cliente.');
    expect(() => requireActive(INACTIVE, 'el cliente')).toThrow(INACTIVE_MESSAGE);
  });

  it('looks the record up by its id', async () => {
    const find = jest.fn((id: string) => Promise.resolve(id === 'c1' ? ACTIVE : null));
    await expect(requireRecord('c1', find, 'el cliente')).resolves.toBe(ACTIVE);
    await expect(requireRecord('c9', find, 'el cliente')).rejects.toThrow('Selecciona el cliente.');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('does not look up a record without id', async () => {
    const find = jest.fn(() => Promise.resolve(ACTIVE));
    await expect(requireRecord('', find, 'el cliente')).rejects.toThrow('Selecciona el cliente.');
    await expect(requireActiveRecord(undefined, find, 'el cliente')).rejects.toThrow(
      'Selecciona el cliente.',
    );
    expect(find).not.toHaveBeenCalled();
  });

  it('looks up an active record', async () => {
    const find = (id: string) => Promise.resolve(id === 'c1' ? ACTIVE : INACTIVE);
    await expect(requireActiveRecord('c1', find, 'el cliente')).resolves.toBe(ACTIVE);
    await expect(requireActiveRecord('c2', find, 'el cliente')).rejects.toThrow(INACTIVE_MESSAGE);
  });
});
