import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Process } from './process.entity';

@Entity('process_versions')
export class ProcessVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  processId!: string;

  @Column()
  versionNumber!: number;

  @Column({ type: 'jsonb' })
  bpmnContent!: Record<string, any>;

  @Column({ nullable: true })
  svgContent?: string;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Process, (process) => process.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processId' })
  process!: Process;
}
