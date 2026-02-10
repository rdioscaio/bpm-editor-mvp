import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateProcessDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
