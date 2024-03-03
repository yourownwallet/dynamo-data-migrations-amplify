import gitRootDir from 'git-root-dir';
import {
    DynamoDBClient,
    ListTablesCommand,
    AttributeValue,
    QueryCommand,
    ScanCommand,
    QueryCommandInput,
    ScanCommandInput,
} from '@aws-sdk/client-dynamodb';
import path from 'path';
import fs from 'fs/promises';

const tableNamePattern = /(?<tableName>[A-Za-z]+)-(?<appId>[\dA-Za-z]+)-(?<env>[A-Za-z]+)/;
async function listTablesInEnv(client: DynamoDBClient): Promise<string[]> {
    const result = await client.send(new ListTablesCommand({}));
    const envName = await safeGitRootDir().then((gitRoot) => getCurrentAmplifyEnvironment(gitRoot));
    return result.TableNames?.filter((name) => name.endsWith(envName)) ?? [];
}

export async function listTables(client: DynamoDBClient): Promise<string[]> {
    const tables = await listTablesInEnv(client);
    const matches = tables.map((name) => name.match(tableNamePattern));
    if (matches == null) {
        return [];
    }
    return matches.filter((match) => match != null && match.groups != null).map((match) => match!.groups!.tableName);
}

export async function getTable(client: DynamoDBClient, name: string): Promise<string | undefined> {
    const tables = await listTablesInEnv(client);
    const matches = tables.filter((fullName) => {
        const match = tableNamePattern.exec(fullName);
        if (match && match.groups) {
            return match.groups.tableName === name;
        }
        return false;
    });
    if (matches.length === 0) {
        return undefined;
    }
    if (matches.length !== 1) {
        throw new Error(`Multiple tables that match the name ${name} ${matches}`);
    }
    return matches[0];
}

export async function getCurrentAmplifyEnvironment(gitRoot: string): Promise<string> {
    const envFilePath = path.join(gitRoot, 'amplify', '.config', 'local-env-info.json');
    const envFile = await fs.readFile(envFilePath, 'utf-8');
    return JSON.parse(envFile).envName;
}

export async function getAPIId(gitRoot: string): Promise<string> {
    const amplifyMetaPath = path.join(gitRoot, 'amplify', 'backend', 'amplify-meta.json');
    const amplifyMeta = await fs.readFile(amplifyMetaPath, 'utf-8');
    const meta = JSON.parse(amplifyMeta);
    const apiIds = [];
    for (const apiName of Object.keys(meta.api)) {
        apiIds.push(meta.api[apiName].output.GraphQLAPIIdOutput);
    }
    if (apiIds.length !== 1) {
        throw new Error(`Unable to determine current API id found ${apiIds.length} apis in amplify-meta.json`);
    }
    return apiIds[0];
}
async function safeGitRootDir(): Promise<string> {
    const gitRoot = await gitRootDir();
    if (gitRoot == null) {
        throw new Error('Unable to determine git root dir');
    }
    return gitRoot;
}
export async function getMigrationTableName() {
    const gitRoot = await safeGitRootDir();
    const amplifyEnv = await getCurrentAmplifyEnvironment(gitRoot!);
    const apiId = await getAPIId(gitRoot!);
    return `MIGRATIONS_LOG_DB-${apiId}-${amplifyEnv}`;
}

export async function queryAll(
    client: DynamoDBClient,
    parameters: QueryCommandInput,
): Promise<Record<string, AttributeValue>[]> {
    const accumulatedResults: Record<string, AttributeValue>[] = [];
    const runScan = async (exclusiveStartKey?: Record<string, AttributeValue>) => {
        const p = exclusiveStartKey == null ? parameters : { ...parameters, ExclusiveStartKey: exclusiveStartKey };
        const queryResult = await client.send(new QueryCommand(p));
        if (queryResult.Items != null) {
            accumulatedResults.push(...queryResult.Items);
        }
        if (queryResult.LastEvaluatedKey != null) {
            await runScan(queryResult.LastEvaluatedKey);
        }
    };
    await runScan();
    return accumulatedResults;
}

export async function scanAll(
    client: DynamoDBClient,
    parameters: ScanCommandInput,
): Promise<Record<string, AttributeValue>[]> {
    const accumulatedResults: Record<string, AttributeValue>[] = [];
    const runScan = async (exclusiveStartKey?: Record<string, AttributeValue>) => {
        const p = exclusiveStartKey == null ? parameters : { ...parameters, ExclusiveStartKey: exclusiveStartKey };
        const scanResult = await client.send(new ScanCommand(p));
        if (scanResult.Items != null) {
            accumulatedResults.push(...scanResult.Items);
        }
        if (scanResult.LastEvaluatedKey != null) {
            await runScan(scanResult.LastEvaluatedKey);
        }
    };
    await runScan();
    return accumulatedResults;
}
