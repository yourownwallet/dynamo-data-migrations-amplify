import gitRootDir from 'git-root-dir';
import fs from 'fs';
import { mockClient } from 'aws-sdk-client-mock';
import {
    DynamoDBClient,
    CreateTableCommand,
    PutItemCommand,
    DeleteItemCommand,
    ListTablesCommand,
    ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { vol } from 'memfs';
import os from 'os';
import path from 'path';
import * as migrationsDb from '../../../src/lib/env/migrationsDb';
import * as config from '../../../src/lib/env/config';

jest.mock('fs');
jest.mock('fs/promises');
jest.mock('git-root-dir');
describe('migrationsDb', () => {
    const ddMock = mockClient(DynamoDBClient);
    beforeEach(() => {
        const gitRoot = 'fakegitroot';
        (gitRootDir as jest.Mock).mockResolvedValue(gitRoot);
        const envInfoPath = path.join('.config/local-env-info.json');
        const metaFilePath = path.join('backend/amplify-meta.json');
        vol.fromJSON(
            {
                [envInfoPath]: JSON.stringify({ envName: 'dev' }),
                [metaFilePath]: JSON.stringify({ api: { myapi: { output: { GraphQLAPIKeyOutput: 'test' } } } }),
            },
            path.join(gitRoot, 'amplify'),
        );
    });
    afterEach(() => {
        ddMock.reset();
        vol.reset();
    });

    describe('configureMigrationsLogDbSchema()', () => {
        it('should resolve when no errors are thrown while creating migrationsLogDb', async () => {
            ddMock.on(CreateTableCommand).resolves({});
            await expect(migrationsDb.configureMigrationsLogDbSchema(new DynamoDBClient({}))).resolves.not.toThrow();
        });

        it('should reject when error is thrown while creating migrationsLogDb', async () => {
            ddMock.on(CreateTableCommand).rejects('Could not create table Migrations_Log');
            await expect(migrationsDb.configureMigrationsLogDbSchema(new DynamoDBClient({}))).rejects.toThrowError(
                'Could not create table Migrations_Log',
            );
        });
    });

    describe('addMigrationToMigrationsLogDb()', () => {
        it('should resolve when no errors are thrown while adding migration to migrationsLogDb', async () => {
            ddMock.on(PutItemCommand).resolves({});
            await expect(Promise.resolve(3)).resolves.not.toThrow();
            await expect(
                migrationsDb.addMigrationToMigrationsLogDb(
                    { fileName: 'abc.ts', appliedAt: '20201014172343' },
                    new DynamoDBClient(),
                ),
            ).resolves.not.toThrow();
        });

        it('should reject when error is thrown while adding migration to migrationsLogDb', async () => {
            ddMock.on(PutItemCommand).rejects('Resource Not Found');
            await expect(
                migrationsDb.addMigrationToMigrationsLogDb(
                    { fileName: 'abc.ts', appliedAt: '20201014172343' },
                    new DynamoDBClient(),
                ),
            ).rejects.toThrow('Resource Not Found');
        });
    });

    describe('deleteMigrationFromMigrationsLogDb()', () => {
        it('should resolve when no errors are thrown while deleting migration', async () => {
            ddMock.on(DeleteItemCommand).resolves({});
            const item: { fileName: string; appliedAt: string } = {
                fileName: '123.ts',
                appliedAt: '123',
            };
            await expect(
                migrationsDb.deleteMigrationFromMigrationsLogDb(item, new DynamoDBClient()),
            ).resolves.not.toThrow();
        });

        it('should reject when error is thrown while deleting migration', async () => {
            ddMock.on(DeleteItemCommand).rejects('Could not delete migration');
            const item: { fileName: string; appliedAt: string } = {
                fileName: '123.ts',
                appliedAt: '123',
            };
            await expect(migrationsDb.deleteMigrationFromMigrationsLogDb(item, new DynamoDBClient())).rejects.toThrow(
                'Could not delete migration',
            );
        });
    });

    describe('doesMigrationsLogDbExists()', () => {
        it('should resolve when no errors are thrown while describing migrationsLogDb', async () => {
            ddMock.on(ListTablesCommand).resolves({ TableNames: ['MIGRATIONS_LOG_DB-undefined-dev'] });
            await expect(migrationsDb.doesMigrationsLogDbExists(new DynamoDBClient())).resolves.toBeTruthy();
        });

        it('should return false if no tables match the name', async () => {
            ddMock.on(ListTablesCommand).resolves({ TableNames: [] });
            await expect(migrationsDb.doesMigrationsLogDbExists(new DynamoDBClient())).resolves.toBeFalsy();
        });
    });

    describe('getAllMigrations()', () => {
        it('should return a migrations array', async () => {
            const Items = [
                {
                    FILE_NAME: { S: 'abc.ts' },
                    APPLIED_AT: { S: '123' },
                },
                {
                    FILE_NAME: { S: 'def.ts' },
                    APPLIED_AT: { S: '124' },
                },
            ];
            ddMock.on(ScanCommand).resolves({ Items });

            const migrations = await migrationsDb.getAllMigrations(new DynamoDBClient());
            expect(migrations).toStrictEqual([
                { FILE_NAME: 'abc.ts', APPLIED_AT: '123' },
                { FILE_NAME: 'def.ts', APPLIED_AT: '124' },
            ]);
        });

        it('should make recursive calls and return the data of all recursive calls in single array', async () => {
            const Items = [
                {
                    FILE_NAME: { S: '1.ts' },
                    APPLIED_AT: { S: '1' },
                },
                {
                    FILE_NAME: { S: '2.ts' },
                    APPLIED_AT: { S: '2' },
                },
            ];

            const LastEvaluatedKey = {
                FILE_NAME: { S: '2.ts' },
                APPLIED_AT: { S: '2' },
            };

            const Items2 = [
                {
                    FILE_NAME: { S: '3.ts' },
                    APPLIED_AT: { S: '3' },
                },
            ];

            ddMock.on(ScanCommand).resolvesOnce({ Items, LastEvaluatedKey }).resolvesOnce({ Items: Items2 });
            const migrations = await migrationsDb.getAllMigrations(new DynamoDBClient());
            expect(migrations).toStrictEqual([
                { FILE_NAME: '1.ts', APPLIED_AT: '1' },
                { FILE_NAME: '2.ts', APPLIED_AT: '2' },
                { FILE_NAME: '3.ts', APPLIED_AT: '3' },
            ]);
        });
    });

    describe('AWS config loading from config file', () => {
        it('should throw error if region is not defined in config file', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([
                {
                    region: '',
                },
            ]);
            await expect(migrationsDb.getDdb()).rejects.toThrow(new Error('Please provide region for profile:default'));
        });

        it('should configure AWS with credentials from config file when config file contains access and secret access keys', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([
                {
                    region: 'testRegion',
                    accessKeyId: 'testAccess',
                    secretAccessKey: 'testSecret',
                },
            ]);
            const dynamodb = await migrationsDb.getDdb();
            await expect(dynamodb.config.region()).resolves.toStrictEqual('testRegion');
            const credentials = await dynamodb.config.credentials();
            expect(credentials.accessKeyId).toStrictEqual('testAccess');
            expect(credentials.secretAccessKey).toStrictEqual('testSecret');
        });

        it('should configure AWS credentials from shared credentials file when credentials are not provided in config file', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([
                {
                    region: 'testRegion',
                },
            ]);
            const awsDir = path.join(os.homedir(), '.aws');
            fs.mkdirSync(awsDir, { recursive: true });
            fs.writeFileSync(
                path.join(awsDir, 'credentials'),
                `
[default]
aws_access_key_id=testAccess
aws_secret_access_key=testSecret
`,
                'utf8',
            );
            const dynamodb = await migrationsDb.getDdb();
            await expect(dynamodb.config.region()).resolves.toStrictEqual('testRegion');
            expect(process.env.AWS_PROFILE).toStrictEqual('default');
        });

        it('should configure AWS with credentials from config file based on input profile', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([
                {
                    region: 'defaultRegion',
                    accessKeyId: 'defaultAccess',
                    secretAccessKey: 'defaultSecret',
                },
                {
                    profile: 'dev',
                    region: 'devRegion',
                    accessKeyId: 'devAccess',
                    secretAccessKey: 'devSecret',
                },
                {
                    profile: 'test',
                    region: 'testRegion',
                    accessKeyId: 'testAccess',
                    secretAccessKey: 'testSecret',
                },
            ]);

            const dynamodbTest = await migrationsDb.getDdb('test');
            await expect(dynamodbTest.config.region()).resolves.toStrictEqual('testRegion');
            const testCredentials = await dynamodbTest.config.credentials();
            expect(testCredentials.accessKeyId).toStrictEqual('testAccess');
            expect(testCredentials.secretAccessKey).toStrictEqual('testSecret');

            const dynamodbDev = await migrationsDb.getDdb('dev');
            await expect(dynamodbDev.config.region()).resolves.toStrictEqual('devRegion');
            const devCredentials = await dynamodbDev.config.credentials();
            expect(devCredentials.accessKeyId).toStrictEqual('devAccess');
            expect(devCredentials.secretAccessKey).toStrictEqual('devSecret');

            const dynamodbDevDefault = await migrationsDb.getDdb('default');
            await expect(dynamodbDevDefault.config.region()).resolves.toStrictEqual('defaultRegion');
            const defaultCredentials = await dynamodbDevDefault.config.credentials();
            expect(defaultCredentials.accessKeyId).toStrictEqual('defaultAccess');
            expect(defaultCredentials.secretAccessKey).toStrictEqual('defaultSecret');
        });
    });
});
