import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DraftBpmnContextDto {
  @IsString()
  @Length(3, 120)
  processName!: string;

  @IsString()
  @Length(3, 400)
  objective!: string;

  @IsString()
  @Length(3, 240)
  trigger!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  actors!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  systems?: string[];

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  keySteps!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  businessRules?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  exceptions?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 500)
  observations?: string;
}

export class DraftBpmnLimitsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(40)
  maxNodes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(80)
  maxFlows?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(100000)
  maxResponseBytes?: number;
}

export class DraftBpmnRequestDto {
  @IsString()
  intent!: 'draft_bpmn';

  @IsOptional()
  @IsString()
  @Length(2, 40)
  policyVersion?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pt-BR'])
  language?: 'pt-BR';

  @ValidateNested()
  @Type(() => DraftBpmnContextDto)
  context!: DraftBpmnContextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftBpmnLimitsDto)
  limits?: DraftBpmnLimitsDto;
}
