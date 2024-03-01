import { PutItemCommand } from "@aws-sdk/client-dynamodb";
export const up = async (ddb) => {
  // adding an entry in table at does not exist
  var params = {
    TableName: 'CUSTOMER',
    Item: {
      'CUSTOMER_ID': { N: '001' },
      'CUSTOMER_NAME': { S: 'dummy' }
    }
  };
  return ddb.send(new PutItemCommand(params));
}

export const down = async (ddb) => {
  // TODO write the statements to rollback your migration (if possible)
}
