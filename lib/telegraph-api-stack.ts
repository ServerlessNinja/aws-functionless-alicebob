import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export class TelegraphApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext("regions");
    const locations = this.node.tryGetContext("locations");

    // AppSync GraphQL API
    const api = new appsync.GraphqlApi(this, "TelegraphApi", {
      name: "TelegraphApi",
      definition: appsync.Definition.fromFile("src/graphql/schema.graphql"),
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
        excludeVerboseContent: true,
        retention: RetentionDays.ONE_WEEK,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(30)),
          }
        }
      }
    });

    // EventBridge data source for AppSync API
    const bus = cdk.aws_events.EventBus.fromEventBusName(
      this, "TelegraphStationBus", "TelegraphStation" + locations?.bob?.city
    );

    const dataSourceBus = api.addEventBridgeDataSource("EventBridgeDataSource", bus, {
      name: "TelegraphStation" + locations.bob.city,
      description: "EventBridge Data Source for Telegraph API",
    });

    bus.grantPutEventsTo(dataSourceBus);

    // EventBridge data source for DynamoDB
    const table = cdk.aws_dynamodb.TableV2.fromTableName(
      this, "TelegraphArchiveTable", "TelegraphArchive"
    );

    const dataSourceTable = api.addDynamoDbDataSource("DynamoDbDataSource", table, {
      name: "TelegraphArchive",
      description: "DynamoDB Data Source for Telegraph API",
    });

    table.grantReadData(dataSourceTable);

    // AppSync API Resolver for EventBridge
    dataSourceBus.createResolver('TelegraphStationResolver', {
      typeName: 'Mutation',
      fieldName: 'sendTelegram',
      requestMappingTemplate: appsync.MappingTemplate.fromFile('src/graphql/eventbridge-request.vtl'),
      responseMappingTemplate: appsync.MappingTemplate.fromFile('src/graphql/eventbridge-response.vtl'),
    });

    // AppSync API Resolver for DynamoDB
    dataSourceTable.createResolver('TelegraphArchiveResolver', {
      typeName: 'Query',
      fieldName: 'getTelegram',
      requestMappingTemplate: appsync.MappingTemplate.fromFile('src/graphql/dynamodb-request.vtl'),
      responseMappingTemplate: appsync.MappingTemplate.fromFile('src/graphql/dynamodb-response.vtl'),
    });

    // Add tags to selected resources for myApplications
    cdk.Tags.of(api).add('cdk:filter', 'Demo');

  }
}
