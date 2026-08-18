import { describe, it, expect } from 'vitest';
import { calculateBasePrice } from '../utils/pricing';

describe('Pricing Utility', () => {
  it('should calculate the default base price correctly', () => {
    const specs = {};
    const price = calculateBasePrice(specs);
    expect(price).toBe(180);
  });

  it('should add sunglasses surcharge', () => {
    const specs = { isSunglasses: true };
    const price = calculateBasePrice(specs);
    expect(price).toBe(180 + 40);
  });

  it('should add bold profile surcharge', () => {
    const specs = { frameProfile: 'bold' };
    const price = calculateBasePrice(specs);
    expect(price).toBe(180 + 20);
  });

  it('should add premium material surcharge (titanium)', () => {
    const specs = { frameMaterial: 'titanium' };
    const price = calculateBasePrice(specs);
    expect(price).toBe(180 + 80);
  });

  it('should calculate complex combinations correctly', () => {
    const specs = {
      isSunglasses: true, // +40
      frameProfile: 'bold', // +20
      frameMaterial: 'carbon_fiber', // +80
      lensMaterial: 'polycarbonate', // +30
      lensTreatments: ['anti_reflective', 'scratch_resistant'], // +30
    };
    const price = calculateBasePrice(specs);
    // 180 + 40 + 20 + 80 + 30 + 30 = 380
    expect(price).toBe(380);
  });
});
