/* eslint-disable global-require */
/* eslint @typescript-eslint/no-var-requires: "off" */
import path from 'path';
import fs from 'fs-extra';
import DynamoDbLocal from 'dynamodb-local';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { ChildProcess } from 'child_process';
import { init } from '../../../src/lib/actions/init';
import { create } from '../../../src/lib/actions/create';
import { up } from '../../../src/lib/actions/up';
import * as migrationsDb from '../../../src/lib/env/migrationsDb';
import { down } from '../../../src/lib/actions/down';
import { status } from '../../../src/lib/actions/status';
import { getMigrationTableName } from '../../../src/lib/amplify';

let migrationFile1: string;
let migrationFile2: string;
let migrationFile3: string;

class ERROR extends Error {
    migrated?: string[];
}

describe('integration test for all types of supported migrations', () => {
    jest.setTimeout(60_000);
    let dynamoServer: ChildProcess;

    const ddb = new DynamoDBClient({
        endpoint: 'http://localhost:4568',
        region: 'local',
        maxAttempts: 5,
    });
    beforeAll(async () => {
        dynamoServer = await DynamoDbLocal.launch(4568);
        await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    afterAll(async () => {
        DynamoDbLocal.stopChild(dynamoServer);
        await Promise.all([
            fs.remove(path.join(process.cwd(), 'migrations')),
            fs.remove(path.join(process.cwd(), 'config.json')),
            fs.remove(path.join(process.cwd(), 'amplify/backend/amplify-meta.json')),
            fs.remove(path.join(process.cwd(), 'amplify/.config/local-env-info.json')),
        ]);
    });

    beforeEach(async () => {
        jest.spyOn(migrationsDb, 'getDdb').mockResolvedValue(ddb);
    });

    afterEach(async () => {
        await Promise.all([
            fs.remove(path.join(process.cwd(), 'migrations')),
            fs.remove(path.join(process.cwd(), 'config.json')),
            fs.remove(path.join(process.cwd(), 'amplify/backend/amplify-meta.json')),
            fs.remove(path.join(process.cwd(), 'amplify/.config/local-env-info.json')),
        ]);
    });

    it('should properly execute init->create->up->down as per requirements for type cjs', async () => {
        await init();
        assertInit();
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/js/config.json'),
            path.join(process.cwd(), 'config.json'),
        );
        fs.mkdirpSync('amplify/.config');
        fs.mkdirpSync('amplify/backend');
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/amplify/.config/local-env-info.json'),
            path.join(process.cwd(), 'amplify/.config/local-env-info.json'),
        );
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/amplify/backend/amplify-meta.json'),
            path.join(process.cwd(), 'amplify/backend/amplify-meta.json'),
        );
        await createMigrationFiles();
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/js/migrationInvalid.cjs'),
            path.join(process.cwd(), 'migrations', migrationFile3),
        );
        assertFileCreation('.cjs');
        await executeAndAssert(ddb);
    });

    it('should properly execute init->create->up->down as per requirements for type mjs', async () => {
        await init();
        assertInit();
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/mjs/config.json'),
            path.join(process.cwd(), 'config.json'),
        );
        fs.mkdirpSync('amplify/.config');
        fs.mkdirpSync('amplify/backend');
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/amplify/.config/local-env-info.json'),
            path.join(process.cwd(), 'amplify/.config/local-env-info.json'),
        );
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/amplify/backend/amplify-meta.json'),
            path.join(process.cwd(), 'amplify/backend/amplify-meta.json'),
        );
        await createMigrationFiles();
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/mjs/migrationInvalid.mjs'),
            path.join(process.cwd(), 'migrations', migrationFile3),
        );
        assertFileCreation('.mjs');
        await executeAndAssert(ddb);
    });

    it('should properly execute init->create->up->down as per requirements for type ts', async () => {
        await init();
        assertInit();
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/ts/config.json'),
            path.join(process.cwd(), 'config.json'),
        );
        fs.mkdirpSync('amplify/.config');
        fs.mkdirpSync('amplify/backend');
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/amplify/.config/local-env-info.json'),
            path.join(process.cwd(), 'amplify/.config/local-env-info.json'),
        );
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/amplify/backend/amplify-meta.json'),
            path.join(process.cwd(), 'amplify/backend/amplify-meta.json'),
        );
        await createMigrationFiles();
        fs.copyFileSync(
            path.join(process.cwd(), 'tests/lib/templates/ts/migrationInvalid.ts'),
            path.join(process.cwd(), 'migrations', migrationFile3),
        );
        assertFileCreation('.ts');
        await executeAndAssert(ddb);
    });
});

async function createMigrationFiles() {
    migrationFile1 = await create('integrationTest_1');
    migrationFile2 = await create('integrationTest_2');
    migrationFile3 = await create('invalidMigration');
}

function assertInit() {
    expect(fs.existsSync(path.join(process.cwd(), 'migrations'))).toBeTruthy();
    expect(fs.existsSync(path.join(process.cwd(), 'config.json'))).toBeTruthy();
}

function assertFileCreation(extension: string) {
    expect(fs.existsSync(path.join(process.cwd(), 'migrations', migrationFile1))).toBeTruthy();
    expect(fs.existsSync(path.join(process.cwd(), 'migrations', migrationFile2))).toBeTruthy();
    expect(fs.existsSync(path.join(process.cwd(), 'migrations', migrationFile3))).toBeTruthy();
    expect(migrationFile1.endsWith(extension)).toBeTruthy();
    expect(migrationFile2.endsWith(extension)).toBeTruthy();
    expect(migrationFile3.endsWith(extension)).toBeTruthy();
}

async function executeAndAssert(ddb: DynamoDBClient) {
    await validateAllUp(ddb);
    await validateOneRollback(ddb);
    await validateOneUp(ddb);
    await validateAllRollback(ddb);
}

async function validateAllRollback(ddb: DynamoDBClient) {
    const rolledBackFiles = await down('default', 0);
    expect(rolledBackFiles).toHaveLength(2);
    expect(rolledBackFiles[0]).toEqual(migrationFile2);
    expect(rolledBackFiles[1]).toEqual(migrationFile1);
    const migrations = await status();
    expect(migrations).toHaveLength(3);
    expect(migrations[0].appliedAt).toEqual('PENDING');
    expect(migrations[1].appliedAt).toEqual('PENDING');
    expect(migrations[2].appliedAt).toEqual('PENDING');
    await assertEntriesInMigrationLogDb(ddb, 0, []);
}

async function validateOneUp(ddb: DynamoDBClient) {
    let migrated: string[];
    try {
        migrated = await up();
    } catch (error) {
        const e = error as ERROR;
        migrated = e.migrated || [];
    }
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toEqual(migrationFile2);
    const migrations = await status();
    expect(migrations).toHaveLength(3);
    expect(migrations[0].appliedAt).not.toEqual('PENDING');
    expect(migrations[1].appliedAt).not.toEqual('PENDING');
    expect(migrations[2].appliedAt).toEqual('PENDING');
    await assertEntriesInMigrationLogDb(ddb, 2, [migrationFile1, migrationFile2]);
}

async function validateOneRollback(ddb: DynamoDBClient) {
    const rolledBackFiles = await down();
    expect(rolledBackFiles).toHaveLength(1);
    expect(rolledBackFiles[0]).toEqual(migrationFile2);
    const migrations = await status();
    expect(migrations).toHaveLength(3);
    expect(migrations[0].appliedAt).not.toEqual('PENDING');
    expect(migrations[1].appliedAt).toEqual('PENDING');
    expect(migrations[2].appliedAt).toEqual('PENDING');
    await assertEntriesInMigrationLogDb(ddb, 1, [migrationFile1]);
}

async function validateAllUp(ddb: DynamoDBClient) {
    let migrated: string[];
    try {
        migrated = await up();
    } catch (error) {
        const e = error as ERROR;
        migrated = e.migrated || [];
    }
    expect(migrated).toHaveLength(2);
    expect(migrated[0]).toEqual(migrationFile1);
    expect(migrated[1]).toEqual(migrationFile2);
    const migrations = await status();
    expect(migrations).toHaveLength(3);
    expect(migrations[0].appliedAt).not.toEqual('PENDING');
    expect(migrations[1].appliedAt).not.toEqual('PENDING');
    expect(migrations[2].appliedAt).toEqual('PENDING');
    await assertEntriesInMigrationLogDb(ddb, 2, [migrationFile1, migrationFile2]);
}

async function assertEntriesInMigrationLogDb(ddb: DynamoDBClient, noOfEntries: number, fileNames: string[]) {
    const migrationsTableName = await getMigrationTableName();
    const params = {
        TableName: migrationsTableName,
    };
    const migrationLogResults: string[] = [];
    const items = await ddb.send(new ScanCommand(params));
    if (items.Items) {
        migrationLogResults.push(
            ...items.Items.map((item) => {
                return item.FILE_NAME.S || '';
            }),
        );
    }
    expect(migrationLogResults).toHaveLength(noOfEntries);
    expect(migrationLogResults).toEqual(expect.arrayContaining(fileNames));
}
