import {
    DynamoDBClient,
    ListTablesCommand,
    CreateTableCommand,
    ScalarAttributeType,
    ScanCommand,
    PutItemCommand,
    DeleteItemCommand,
    KeyType,
} from '@aws-sdk/client-dynamodb';
import * as config from './config';
import { getMigrationTableName } from '../amplify';

export async function getDdb(profile = 'default'): Promise<DynamoDBClient> {
    await loadAwsConfig(profile);
    return new DynamoDBClient({});
}

export async function configureMigrationsLogDbSchema(ddb: DynamoDBClient) {
    const tableName = await getMigrationTableName();
    const params = {
        AttributeDefinitions: [
            {
                AttributeName: 'FILE_NAME',
                AttributeType: ScalarAttributeType.S,
            },
            {
                AttributeName: 'APPLIED_AT',
                AttributeType: ScalarAttributeType.S,
            },
        ],
        KeySchema: [
            {
                AttributeName: 'FILE_NAME',
                KeyType: KeyType.HASH,
            },
            {
                AttributeName: 'APPLIED_AT',
                KeyType: KeyType.RANGE,
            },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
        },
        TableName: tableName,
        StreamSpecification: {
            StreamEnabled: false,
        },
    };
    await ddb.send(new CreateTableCommand(params));
}

export async function addMigrationToMigrationsLogDb(
    item: { fileName: string; appliedAt: string },
    ddb: DynamoDBClient,
) {
    const migrationTableName = await getMigrationTableName();
    const params = {
        TableName: migrationTableName,
        Item: {
            FILE_NAME: { S: item.fileName },
            APPLIED_AT: { S: item.appliedAt },
        },
    };

    return ddb.send(new PutItemCommand(params));
}

export async function deleteMigrationFromMigrationsLogDb(
    item: { fileName: string; appliedAt: string },
    ddb: DynamoDBClient,
) {
    const migrationTableName = await getMigrationTableName();
    const params = {
        TableName: migrationTableName,
        Key: {
            FILE_NAME: { S: item.fileName },
            APPLIED_AT: { S: item.appliedAt },
        },
    };
    return ddb.send(new DeleteItemCommand(params));
}

export async function doesMigrationsLogDbExists(ddb: DynamoDBClient) {
    const migrationTableName = await getMigrationTableName();

    let tables = await ddb.send(new ListTablesCommand({}));
    let logDB = tables.TableNames?.filter((table) => table === migrationTableName);
    while (
        logDB?.length === 0 &&
        tables.LastEvaluatedTableName !== null &&
        tables.LastEvaluatedTableName !== undefined
    ) {
        tables = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: tables.LastEvaluatedTableName }));
        logDB = tables.TableNames?.filter((table) => table === migrationTableName);
    }

    if (logDB === null || logDB === undefined || logDB.length === 0) {
        return false;
    }
    if (logDB.length !== 1) {
        throw new Error('Multiple potential matches for the migration log db');
    }
    return true;
}

export async function getAllMigrations(ddb: DynamoDBClient) {
    const migrations: { FILE_NAME?: string; APPLIED_AT?: string }[] = [];
    const migrationLogTableName = await getMigrationTableName();
    let migrationScan = await ddb.send(new ScanCommand({ TableName: migrationLogTableName }));
    for (const item of migrationScan.Items ?? []) {
        migrations.push({
            FILE_NAME: item.FILE_NAME.S,
            APPLIED_AT: item.APPLIED_AT.S,
        });
    }

    while (migrationScan.LastEvaluatedKey != null) {
        migrationScan = await ddb.send(
            new ScanCommand({ TableName: migrationLogTableName, ExclusiveStartKey: migrationScan.LastEvaluatedKey }),
        );
        for (const item of migrationScan.Items ?? []) {
            migrations.push({
                FILE_NAME: item.FILE_NAME.S,
                APPLIED_AT: item.APPLIED_AT.S,
            });
        }
    }

    return migrations;
}

async function loadAwsConfig(inputProfile: string) {
    const configFromFile = await config.loadAWSConfig();

    // Check for data for input profile
    const profileConfig = configFromFile.find(
        (obj: { profile: string; region: string; accessKeyId: string; secretAccessKey: string }) => {
            return obj.profile === inputProfile || (!obj.profile && inputProfile === 'default');
        },
    );

    // Populate  region
    if (profileConfig && profileConfig.region) {
        process.env.AWS_REGION = profileConfig.region;
    } else {
        throw new Error(`Please provide region for profile:${inputProfile}`);
    }

    if (profileConfig && profileConfig.accessKeyId && profileConfig.secretAccessKey) {
        process.env.AWS_ACCESS_KEY_ID = profileConfig.accessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = profileConfig.secretAccessKey;
        delete process.env.AWS_PROFILE;
    } else {
        // Load config from shared credentials file if present
        process.env.AWS_PROFILE = inputProfile;
        // AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: inputProfile });
    }
}
