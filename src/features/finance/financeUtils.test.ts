import { describe, expect, it } from 'vitest';
import {
  CARD_COMMISSION,
  CATEGORY_COLORS,
  EXPENSE_CATEGORIES,
  cardCommission,
  fmtDate,
  methodLabel,
  money,
  monthLabel,
  netAfterCommission
} from './financeUtils';

describe('money', () => {
  it('formats a whole number as MXN with no decimals', () => {
    expect(money(1000)).toContain('1,000');
    expect(money(1000)).toContain('$');
  });

  it('formats a decimal amount with up to 2 decimal places', () => {
    expect(money(335.79)).toContain('335.79');
  });

  it('formats zero', () => {
    expect(money(0)).toContain('0');
  });

  it('falls back to 0 for NaN', () => {
    expect(money(NaN)).toContain('0');
  });

  it('falls back to 0 for Infinity', () => {
    expect(money(Infinity)).toContain('0');
  });
});

describe('netAfterCommission', () => {
  it('deducts the card commission from the gross amount', () => {
    const net = netAfterCommission(1000);
    expect(net).toBeCloseTo(1000 * (1 - CARD_COMMISSION), 1);
  });

  it('rounds to 2 decimal places', () => {
    const net = netAfterCommission(100);
    expect(net).toBe(Math.round(100 * (1 - CARD_COMMISSION) * 100) / 100);
  });
});

describe('cardCommission', () => {
  it('returns the terminal fee (gross minus net)', () => {
    // El bruto y la comisión deben reconstruir el monto original sin perder cents.
    expect(cardCommission(1000)).toBe(40.6);
    expect(cardCommission(1000) + netAfterCommission(1000)).toBeCloseTo(1000, 2);
  });

  it('is zero for a zero amount', () => {
    expect(cardCommission(0)).toBe(0);
  });
});

describe('monthLabel', () => {
  it('returns Spanish abbreviation for January', () => {
    expect(monthLabel('2026-01')).toBe('Ene');
  });

  it('returns Spanish abbreviation for December', () => {
    expect(monthLabel('2026-12')).toBe('Dic');
  });

  it('returns the raw string when the month part is invalid', () => {
    expect(monthLabel('2026-99')).toBe('2026-99');
  });
});

describe('fmtDate', () => {
  it('returns empty string for empty input', () => {
    expect(fmtDate('')).toBe('');
  });

  it('formats a date-only string without time', () => {
    const result = fmtDate('2026-06-01');
    expect(result).not.toContain('·');
    expect(result.length).toBeGreaterThan(3);
  });

  it('formats an ISO datetime string with a time separator', () => {
    const result = fmtDate('2026-06-01T14:30:00');
    expect(result).toContain('·');
  });
});

describe('methodLabel', () => {
  it('labels tarjeta as combined card/transfer label', () => {
    expect(methodLabel('tarjeta')).toBe('Tarjeta / Trans.');
  });

  it('labels transferencia as combined card/transfer label', () => {
    expect(methodLabel('transferencia')).toBe('Tarjeta / Trans.');
  });

  it('labels efectivo as cash', () => {
    expect(methodLabel('efectivo')).toBe('Efectivo');
  });

  it('returns the raw string for unknown methods', () => {
    expect(methodLabel('crypto')).toBe('crypto');
  });
});

describe('constants', () => {
  it('EXPENSE_CATEGORIES includes standard categories', () => {
    expect(EXPENSE_CATEGORIES).toContain('renta');
    expect(EXPENSE_CATEGORIES).toContain('nomina');
    expect(EXPENSE_CATEGORIES).toContain('otro');
  });

  it('CATEGORY_COLORS has a color for each category', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      if (cat !== 'otro') {
        expect(CATEGORY_COLORS[cat]).toMatch(/^#/);
      }
    }
    expect(CATEGORY_COLORS.otro).toMatch(/^#/);
  });
});
