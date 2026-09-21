import { describe, expect, it } from 'vitest';
import { formatInr, parseAmountToPaise } from './currency';

describe('currency (INR) formatting and parsing', () => {
  describe('formatInr', () => {
    it('formats 0 paise as ₹0.00', () => {
      expect(formatInr(0n)).toBe('₹0.00');
    });

    it('formats single digit paise correctly', () => {
      expect(formatInr(5n)).toBe('₹0.05');
      expect(formatInr(9n)).toBe('₹0.09');
    });

    it('formats exact rupees correctly', () => {
      expect(formatInr(100n)).toBe('₹1.00');
      expect(formatInr(50000n)).toBe('₹500.00');
    });

    it('formats rupees and paise correctly', () => {
      expect(formatInr(12345n)).toBe('₹123.45');
    });

    it('formats negative amounts with minus before the rupee sign', () => {
      expect(formatInr(-50000n)).toBe('-₹500.00');
      expect(formatInr(-75n)).toBe('-₹0.75');
    });

    it('handles large BigInt values', () => {
      expect(formatInr(100000000000n)).toBe('₹1000000000.00');
    });
  });

  describe('parseAmountToPaise', () => {
    it('parses integer rupee inputs', () => {
      expect(parseAmountToPaise('500')).toBe(50000n);
      expect(parseAmountToPaise('1')).toBe(100n);
    });

    it('parses single decimal place input as tens of paise', () => {
      expect(parseAmountToPaise('10.5')).toBe(1050n);
      expect(parseAmountToPaise('0.5')).toBe(50n);
    });

    it('parses two decimal places input', () => {
      expect(parseAmountToPaise('10.55')).toBe(1055n);
      expect(parseAmountToPaise('0.01')).toBe(1n);
    });

    it('rejects more than two decimal places', () => {
      expect(() => parseAmountToPaise('10.555')).toThrow('at most two decimal places');
      expect(() => parseAmountToPaise('9.999')).toThrow('at most two decimal places');
    });

    it('rejects zero or negative values', () => {
      expect(() => parseAmountToPaise('0')).toThrow('greater than zero');
      expect(() => parseAmountToPaise('0.00')).toThrow('greater than zero');
    });

    it('rejects non-numeric inputs', () => {
      expect(() => parseAmountToPaise('abc')).toThrow();
      expect(() => parseAmountToPaise('')).toThrow();
      expect(() => parseAmountToPaise('-50')).toThrow();
    });
  });
});
