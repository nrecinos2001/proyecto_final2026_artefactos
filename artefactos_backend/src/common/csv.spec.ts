import { localDateTime, toCsv } from './csv';

describe('csv', () => {
  it('el CSV escapa comas y comillas y deja vacíos los nulos', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['x,y', null],
          ['dijo "hola"', 1.5],
        ],
      ),
    ).toBe('a,b\n"x,y",\n"dijo ""hola""",1.5\n');
  });

  it('la fecha sale en hora local para abrirla en Excel', () => {
    expect(localDateTime(new Date(2026, 10, 18, 7, 5, 9))).toBe(
      '2026-11-18 07:05:09',
    );
  });
});
