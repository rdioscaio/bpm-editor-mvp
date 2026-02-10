import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Process } from './entities/process.entity';
import { ProcessVersion } from './entities/process-version.entity';
import { CreateProcessDto } from './dto/create-process.dto';
import { SaveVersionDto } from './dto/save-version.dto';

@Injectable()
export class ProcessService {
  constructor(
    @InjectRepository(Process)
    private processRepository: Repository<Process>,
    @InjectRepository(ProcessVersion)
    private versionRepository: Repository<ProcessVersion>,
  ) {}

  async createProcess(dto: CreateProcessDto): Promise<Process> {
    const process = this.processRepository.create({
      name: dto.name,
      description: dto.description,
      responsible: dto.responsible,
      tags: dto.tags || [],
    });
    return this.processRepository.save(process);
  }

  async getAllProcesses(): Promise<Process[]> {
    return this.processRepository.find({
      relations: ['versions'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getProcessById(id: string): Promise<Process> {
    const process = await this.processRepository.findOne({
      where: { id },
      relations: ['versions'],
    });
    if (!process) {
      throw new NotFoundException(`Processo ${id} não encontrado`);
    }
    return process;
  }

  async updateProcess(id: string, dto: Partial<CreateProcessDto>): Promise<Process> {
    const process = await this.getProcessById(id);
    Object.assign(process, dto);
    return this.processRepository.save(process);
  }

  async deleteProcess(id: string): Promise<void> {
    await this.getProcessById(id);
    await this.processRepository.delete(id);
  }

  async saveVersion(processId: string, dto: SaveVersionDto): Promise<ProcessVersion> {
    const process = await this.getProcessById(processId);

    // Contar versões existentes
    const versionCount = await this.versionRepository.count({
      where: { processId },
    });

    const version = this.versionRepository.create({
      processId,
      versionNumber: versionCount + 1,
      bpmnContent: dto.bpmnContent,
      svgContent: dto.svgContent,
      description: dto.description,
    });

    const savedVersion = await this.versionRepository.save(version);

    // Atualizar currentVersionId do processo
    process.currentVersionId = savedVersion.id;
    await this.processRepository.save(process);

    return savedVersion;
  }

  async getVersions(processId: string): Promise<ProcessVersion[]> {
    await this.getProcessById(processId);
    return this.versionRepository.find({
      where: { processId },
      order: { versionNumber: 'DESC' },
    });
  }

  async getVersion(processId: string, versionId: string): Promise<ProcessVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId, processId },
    });
    if (!version) {
      throw new NotFoundException(`Versão ${versionId} não encontrada`);
    }
    return version;
  }

  async validateBpmn(bpmnContent: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validação básica
    if (!bpmnContent.elements || !Array.isArray(bpmnContent.elements)) {
      errors.push('BPMN deve conter array de elementos');
      return { valid: false, errors };
    }

    const elements = bpmnContent.elements;
    const elementIds = new Set(elements.map((e: any) => e.id));

    // Verificar start event
    const hasStartEvent = elements.some((e: any) => e.type === 'bpmn:StartEvent');
    if (!hasStartEvent) {
      errors.push('Deve haver pelo menos um Start Event');
    }

    // Verificar end event
    const hasEndEvent = elements.some((e: any) => e.type === 'bpmn:EndEvent');
    if (!hasEndEvent) {
      errors.push('Deve haver pelo menos um End Event');
    }

    // Verificar tasks têm nome
    elements.forEach((e: any) => {
      if (e.type === 'bpmn:Task' && !e.name) {
        errors.push(`Task ${e.id} deve ter um nome`);
      }
    });

    // Verificar flows referem a elementos válidos
    if (bpmnContent.flows && Array.isArray(bpmnContent.flows)) {
      bpmnContent.flows.forEach((flow: any) => {
        if (!elementIds.has(flow.source)) {
          errors.push(`Flow ${flow.id}: source ${flow.source} não existe`);
        }
        if (!elementIds.has(flow.target)) {
          errors.push(`Flow ${flow.id}: target ${flow.target} não existe`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
