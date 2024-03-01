import gitRootDir from 'git-root-dir';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import path from 'path';
import fs from 'fs/promises';

export async function listTables(client: DynamoDBClient): Promise<string[]> {
    const result = await client.send(new ListTablesCommand({}));
    const envName = await safeGitRootDir().then((gitRoot) => getCurrentAmplifyEnvironment(gitRoot));
    const matches = result.TableNames?.filter((name) => name.endsWith(envName)).map((name) =>
        name.match(/(?<tableName>[A-Za-z]+)-(?<appId>[A-Za-z]+)-(?<env>[A-Za-z]+)/),
    );
    if (matches == null) {
        return [];
    }
    return matches.filter((match) => match != null && match.groups != null).map((match) => match!.groups!.tableName);
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
