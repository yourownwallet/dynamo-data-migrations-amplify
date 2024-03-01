import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

export async function up(ddb: DynamoDBClient) {
    // adding an entry in table at does not exist
    const params = {
        TableName: 'CUSTOMER',
        Item: {
            CUSTOMER_ID: { N: '001' },
            CUSTOMER_NAME: { S: 'dummy' },
        },
    };

    // Call DynamoDB to add the item to the table
    return ddb.send(new PutItemCommand(params));
}

export async function down(ddb: DynamoDBClient) {
    const params = {
        TableName: 'CUSTOMER',
        Item: {
            CUSTOMER_ID: { N: '001' },
            CUSTOMER_NAME: { S: 'dummy' },
        },
    };
    return ddb.send(new PutItemCommand(params));
}
