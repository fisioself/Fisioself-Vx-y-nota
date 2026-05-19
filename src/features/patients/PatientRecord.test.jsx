import { describe, expect, it } from 'vitest';
import { getNextSessionNumber } from './PatientRecord.jsx';

describe('getNextSessionNumber', () => {
  it('uses the highest existing session number instead of the row count', () => {
    expect(
      getNextSessionNumber([{ session_number: 1 }, { session_number: 4 }, { session_number: 2 }])
    ).toBe(5);
  });

  it('ignores invalid session numbers safely', () => {
    expect(getNextSessionNumber([{ session_number: 'bad' }, {}, { session_number: 2 }])).toBe(3);
  });
});
