import { Controller, Get, Post, Put, Delete, Param, Body, BadRequestException } from '@nestjs/common';
import { ProcessService } from './process.service';
import { CreateProcessDto } from './dto/create-process.dto';
import { SaveVersionDto } from './dto/save-version.dto';

@Controller('api/processes')
export class ProcessController {
  constructor(private readonly processService: ProcessService) {}

  @Post()
  async create(@Body() dto: CreateProcessDto) {
    return this.processService.createProcess(dto);
  }

  @Get()
  async findAll() {
    return this.processService.getAllProcesses();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.processService.getProcessById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateProcessDto>) {
    return this.processService.updateProcess(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.processService.deleteProcess(id);
    return { success: true };
  }

  @Post(':id/validate')
  async validate(@Param('id') id: string, @Body() dto: SaveVersionDto) {
    return this.processService.validateBpmn(dto.bpmnContent);
  }

  @Post(':id/versions')
  async saveVersion(@Param('id') id: string, @Body() dto: SaveVersionDto) {
    const validation = await this.processService.validateBpmn(dto.bpmnContent);
    if (!validation.valid) {
      throw new BadRequestException(`BPMN inválido: ${validation.errors.join(', ')}`);
    }
    return this.processService.saveVersion(id, dto);
  }

  @Get(':id/versions')
  async getVersions(@Param('id') id: string) {
    return this.processService.getVersions(id);
  }

  @Get(':id/versions/:versionId')
  async getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.processService.getVersion(id, versionId);
  }
}
