import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import {
  CreateDeviceDto,
  ReplaceCalibrationDto,
  UpdateDeviceDto,
} from './dto/device.dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  findAll() {
    return this.devices.findAll();
  }

  @Post()
  create(@Body() dto: CreateDeviceDto) {
    return this.devices.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.remove(id);
  }

  @Get(':id/calibration')
  getCalibration(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.getCalibration(id);
  }

  /** Reemplaza la tabla completa de calibración (lista vacía = usar fórmula) */
  @Put(':id/calibration')
  replaceCalibration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceCalibrationDto,
  ) {
    return this.devices.replaceCalibration(id, dto.points);
  }
}
