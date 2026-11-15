import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Campos configurables de una cisterna (todos opcionales para PATCH) */
export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  areaCm2?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  capacityLiters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reservePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lowPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  criticalPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  windowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  stableMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(1)
  turbidityThresholdRatio?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  turbidityConsecutive?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  turbidityReferenceVoltage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  cleaningIntervalDays?: number;
}

export class CreateDeviceDto extends UpdateDeviceDto {
  /** Identificador usado en los tópicos MQTT: cisterna/<code>/... */
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/, {
    message: 'code solo admite letras, números, guion y guion bajo',
  })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  declare name: string;
}

export class CalibrationPointDto {
  @IsNumber()
  @Min(0)
  distanceCm: number;

  @IsNumber()
  @Min(0)
  liters: number;
}

export class ReplaceCalibrationDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CalibrationPointDto)
  points: CalibrationPointDto[];
}
