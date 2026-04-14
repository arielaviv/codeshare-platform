import { __test__ } from '../src/services/pricing.service';

const { pricingForTier, TIER_CONFIG, sanitizePhases } = __test__;

describe('pricing.service helpers', () => {
  describe('pricingForTier', () => {
    it('returns polish prices in the $0.05–$0.19 range', () => {
      const atomic = pricingForTier('polish', 'atomic');
      const multi = pricingForTier('polish', 'multi-component');
      const novel = pricingForTier('polish', 'novel');
      expect(atomic.dealerCents).toBeGreaterThanOrEqual(5);
      expect(atomic.dealerCents).toBeLessThanOrEqual(19);
      expect(novel.dealerCents).toBeGreaterThan(atomic.dealerCents);
      expect(multi.dealerCents).toBeGreaterThan(atomic.dealerCents);
      expect(multi.dealerCents).toBeLessThan(novel.dealerCents);
      expect(atomic.anchorCents).toBe(TIER_CONFIG.polish.anchorCents);
    });

    it('returns brains prices in the $0.19–$0.79 range', () => {
      const atomic = pricingForTier('brains', 'atomic');
      const novel = pricingForTier('brains', 'novel');
      expect(atomic.dealerCents).toBeGreaterThanOrEqual(19);
      expect(novel.dealerCents).toBeLessThanOrEqual(79);
    });

    it('returns power prices in the $0.79–$1.99 range', () => {
      const atomic = pricingForTier('power', 'atomic');
      const novel = pricingForTier('power', 'novel');
      expect(atomic.dealerCents).toBeGreaterThanOrEqual(79);
      expect(novel.dealerCents).toBeLessThanOrEqual(199);
    });

    it('assigns haiku model to polish, sonnet to brains + power', () => {
      expect(pricingForTier('polish', 'atomic').modelTier).toBe('haiku');
      expect(pricingForTier('brains', 'atomic').modelTier).toBe('sonnet');
      expect(pricingForTier('power', 'atomic').modelTier).toBe('sonnet');
    });

    it('always shows dealer < anchor for the crossed-out savings effect', () => {
      for (const tier of ['polish', 'brains', 'power'] as const) {
        for (const complexity of ['atomic', 'multi-component', 'novel'] as const) {
          const p = pricingForTier(tier, complexity);
          expect(p.dealerCents).toBeLessThan(p.anchorCents);
        }
      }
    });

    it('includes a nonzero risk premium for power tier', () => {
      expect(pricingForTier('power', 'atomic').riskPremiumCents).toBeGreaterThan(0);
      expect(pricingForTier('polish', 'atomic').riskPremiumCents).toBe(0);
    });

    it('bakes a revision budget of ~15% of dealer price', () => {
      const p = pricingForTier('brains', 'multi-component');
      expect(p.revisionBudgetCents).toBeGreaterThanOrEqual(Math.round(p.dealerCents * 0.1));
      expect(p.revisionBudgetCents).toBeLessThanOrEqual(Math.round(p.dealerCents * 0.2));
    });
  });

  describe('sanitizePhases', () => {
    it('returns a default phase when input is empty', () => {
      expect(sanitizePhases([])).toEqual([
        { name: 'Build', steps: [{ description: 'Generate files' }] },
      ]);
    });

    it('caps phases at 3 and steps at 5', () => {
      const raw = Array.from({ length: 5 }, (_, i) => ({
        name: `Phase ${i + 1}`,
        steps: Array.from({ length: 10 }, (_, j) => `Step ${j + 1}`),
      }));
      const sanitized = sanitizePhases(raw);
      expect(sanitized).toHaveLength(3);
      expect(sanitized[0].steps).toHaveLength(5);
    });

    it('drops empty step strings', () => {
      const result = sanitizePhases([
        { name: 'Build', steps: ['', '  ', 'real step'] },
      ]);
      expect(result[0].steps).toEqual([{ description: 'real step' }]);
    });

    it('defaults a missing phase name to "Build"', () => {
      const result = sanitizePhases([{ name: '', steps: ['do a thing'] }]);
      expect(result[0].name).toBe('Build');
    });
  });
});
