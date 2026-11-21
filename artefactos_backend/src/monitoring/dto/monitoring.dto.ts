import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class RangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Máximo de puntos devueltos (se submuestrea si hay más) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(5000)
  maxPoints?: number;
}

export class ExportQueryDto extends RangeQueryDto {
  @IsIn(['nivel', 'turbidez'])
  tipo: 'nivel' | 'turbidez';
}

export class AlertsQueryDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SimulateDto {
  @IsIn(['nivel', 'turbidez'])
  kind: 'nivel' | 'turbidez';

  /** nivel: distancia en cm; turbidez: voltaje */
  @IsNumber()
  @Min(0)
  @Max(1000)
  value: number;
}

export class ProfileRecomputeDto {
  /** Día a procesar (YYYY-MM-DD). Por defecto, hoy. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
