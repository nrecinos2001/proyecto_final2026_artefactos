import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDeviceDto, UpdateDeviceDto } from './device.dto';

describe('device DTOs', () => {
  it('crear una cisterna sin nombre es rechazado', () => {
    const errors = validateSync(
      plainToInstance(CreateDeviceDto, { code: 'sin-nombre' }),
    );
    expect(errors.map((e) => e.property)).toContain('name');
  });

  it('actualizar sin nombre sigue permitido', () => {
    expect(
      validateSync(plainToInstance(UpdateDeviceDto, { lowPercent: 40 })),
    ).toHaveLength(0);
  });
});
