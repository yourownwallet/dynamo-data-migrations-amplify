const { PutItemCommand } = require("@aws-sdk/client-dynamodb");

module.exports = {
  async up(ddb) {
    // adding an entry in table at does not exist
    var params = {
      TableName: 'CUSTOMER',
      Item: {
        'CUSTOMER_ID': { N: '001' },
        'CUSTOMER_NAME': { S: 'dummy' }
      }
    };

    // Call DynamoDB to add the item to the table
    return ddb.send(new PutItemCommand(params));
  },

  async down(ddb) {
    // TODO write the statements to rollback your migration (if possible)
  }
};
