import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

export class TelegraphGuiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext("regions");
    const locations = this.node.tryGetContext("locations");

    // AppSync GraphQL API
    const api = new appsync.GraphqlApi(this, "TelegraphApi", {
      name: "TelegraphApi",
      definition: appsync.Definition.fromFile("src/graphql/schema.graphql"),
      xrayEnabled: true,
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(90)),
          }
        }
      }
    });

    // EventBridge data source for AppSync API
    const bus = cdk.aws_events.EventBus.fromEventBusName(this, "TelegraphStationBus", "TelegraphStation");
    const dataSource = api.addEventBridgeDataSource("EventBridgeDataSource", bus, {
      name: "TelegraphStation",
      description: "EventBridge Data Source for Telegraph API",
    });

    bus.grantPutEventsTo(dataSource);

    // AppSync API Resolver
    dataSource.createResolver('TelegraphStationResolver', {
      typeName: 'Mutation',
      fieldName: 'sendTelegram',
      requestMappingTemplate: appsync.MappingTemplate.fromFile('src/graphql/eventbus-request.vtl'),
      responseMappingTemplate: appsync.MappingTemplate.fromFile('src/graphql/eventbus-response.vtl'),
    });

    // Add tags to selected resources for myApplications
    cdk.Tags.of(api).add('cdk:filter', 'Demo');

  }
}
