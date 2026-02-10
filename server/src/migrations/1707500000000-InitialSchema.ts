import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class InitialSchema1707500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Criar tabela processes
    await queryRunner.createTable(
      new Table({
        name: 'process',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'responsible',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: true,
            default: "'[]'",
          },
          {
            name: 'currentVersionId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Criar tabela process_version
    await queryRunner.createTable(
      new Table({
        name: 'process_version',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'processId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'versionNumber',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'bpmnContent',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'svgContent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Adicionar foreign key
    await queryRunner.createForeignKey(
      'process_version',
      new TableForeignKey({
        columnNames: ['processId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'process',
        onDelete: 'CASCADE',
      }),
    );

    // Criar índices
    await queryRunner.query(
      `CREATE INDEX "IDX_process_version_processId" ON "process_version" ("processId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_process_version_versionNumber" ON "process_version" ("versionNumber")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover índices
    await queryRunner.query(`DROP INDEX "IDX_process_version_versionNumber"`);
    await queryRunner.query(`DROP INDEX "IDX_process_version_processId"`);

    // Remover foreign key
    await queryRunner.dropForeignKey(
      'process_version',
      'FK_process_version_processId',
    );

    // Remover tabelas
    await queryRunner.dropTable('process_version');
    await queryRunner.dropTable('process');
  }
}
