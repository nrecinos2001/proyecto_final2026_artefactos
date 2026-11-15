import {
  consumptionFromSeries,
  distanceToLiters,
  emaUpdate,
  estimateRemaining,
  regressionSlopeLph,
} from './water-math';

describe('water-math', () => {
  const geometry = { heightCm: 100, areaCm2: 11_000, capacityLiters: 1100 };

  describe('distanceToLiters', () => {
    it('usa V = A x (H - d)', () => {
      // 11,000 cm² x (100 - 40) cm = 660,000 cm³ = 660 L
      expect(distanceToLiters(40, geometry)).toBeCloseTo(660);
    });

    it('limita el resultado entre 0 y la capacidad', () => {
      expect(distanceToLiters(120, geometry)).toBe(0);
      expect(distanceToLiters(-5, geometry)).toBe(1100);
    });

    it('interpola en la tabla de calibración', () => {
      const table = [
        { distanceCm: 10, liters: 1000 },
        { distanceCm: 50, liters: 400 },
        { distanceCm: 90, liters: 0 },
      ];
      expect(distanceToLiters(30, geometry, table)).toBeCloseTo(700);
      expect(distanceToLiters(70, geometry, table)).toBeCloseTo(200);
      expect(distanceToLiters(5, geometry, table)).toBeCloseTo(1075); // extrapola
    });
  });

  describe('regressionSlopeLph', () => {
    it('obtiene el caudal de una recta perfecta', () => {
      const t0 = Date.UTC(2026, 0, 1);
      // Baja 0.5 L por minuto = -30 L/h
      const pts = Array.from({ length: 31 }, (_, i) => ({
        t: t0 + i * 60_000,
        v: 660 - 0.5 * i,
      }));
      expect(regressionSlopeLph(pts)).toBeCloseTo(-30);
    });

    it('devuelve null con menos de 3 lecturas', () => {
      expect(regressionSlopeLph([{ t: 0, v: 1 }])).toBeNull();
    });
  });

  it('consumptionFromSeries ignora llenados y ruido', () => {
    expect(consumptionFromSeries([100, 99.8, 95, 90, 120, 110], 1)).toBeCloseTo(
      20,
    );
  });

  it('emaUpdate aplica 0.3 / 0.7', () => {
    expect(emaUpdate(null, 50)).toBe(50);
    expect(emaUpdate(100, 50)).toBeCloseTo(85);
  });

  describe('estimateRemaining', () => {
    const now = new Date(2026, 2, 15, 6, 0, 0); // 6:00 a.m. hora local

    it('ejemplo del anteproyecto: 550 L / 30 L/h = 18.3 h', () => {
      const e = estimateRemaining({
        now,
        currentLiters: 660,
        capacityLiters: 1100,
        reserveLiters: 110,
        flowLph: -30,
        profile: null,
      });
      expect(e.mode).toBe('vaciando');
      expect(e.method).toBe('directo');
      expect(e.hours).toBeCloseTo(18.33, 1);
    });

    it('con perfil usa el consumo esperado de cada hora', () => {
      const profile = Array(24).fill(5);
      profile[6] = 60;
      profile[7] = 60;
      // Hora en curso (6:00-7:00) con Q = 30, 7:00-8:00 con 60, luego 5 L/h
      const e = estimateRemaining({
        now,
        currentLiters: 210,
        capacityLiters: 1100,
        reserveLiters: 110,
        flowLph: -30,
        profile,
      });
      // 100 L utilizables: 30 (h1) + 60 (h2) + 10 L a 5 L/h = 2 h → 4 h
      expect(e.method).toBe('perfil');
      expect(e.hours).toBeCloseTo(4);
    });

    it('estima el tiempo de llenado cuando la pendiente es positiva', () => {
      const e = estimateRemaining({
        now,
        currentLiters: 600,
        capacityLiters: 1100,
        reserveLiters: 110,
        flowLph: 100,
        profile: null,
      });
      expect(e.mode).toBe('llenando');
      expect(e.hours).toBeCloseTo(5);
    });

    it('caudal casi cero = estable', () => {
      const e = estimateRemaining({
        now,
        currentLiters: 600,
        capacityLiters: 1100,
        reserveLiters: 110,
        flowLph: -2,
        profile: null,
      });
      expect(e.mode).toBe('estable');
      expect(e.hours).toBeNull();
    });
  });
});
