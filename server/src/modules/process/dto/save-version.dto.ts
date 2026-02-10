import { IsObject, IsOptional, IsString } from 'class-validator';

export class SaveVersionDto {
  @IsObject()
  bpmnContent!: Record<string, any>;

  @IsOptional()
  @IsString()
  svgContent?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
