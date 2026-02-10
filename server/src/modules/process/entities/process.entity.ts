import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ProcessVersion } from './process-version.entity';

@Entity('process')
export class Process {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  responsible?: string;

  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  tags?: string[];

  @Column({ nullable: true })
  currentVersionId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ProcessVersion, (version) => version.process)
  versions!: ProcessVersion[];
}
