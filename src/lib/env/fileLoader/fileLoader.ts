import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export interface Migration {
    up(ddb: DynamoDBClient): Promise<void>;
    down(ddb: DynamoDBClient): Promise<void>;
}

export abstract class FileLoader {
    configExtension: string;

    migrationTemplate: string;

    constructor(extension: string, migrationPath: string) {
        this.configExtension = extension;
        this.migrationTemplate = migrationPath;
    }

    abstract loadMigrationFile(importPath: string): Promise<Migration>;
}
