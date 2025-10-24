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
      schema: appsync.SchemaFile.fromAsset("src/graphql/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(90)),
          },
        },
      },
      xrayEnabled: true,
    });

    // EventBridge data source for AppSync API
    const bus = cdk.aws_events.EventBus.fromEventBusName(this, "TelegraphStationBus", "TelegraphStation");
    const dataSource = api.addEventBridgeDataSource("EventBridgeDataSource", bus, {
      name: "TelegraphStation",
      description: "EventBridge Data Source for Telegraph API",
    });

    // AppSync API Resolver
    dataSource.createResolver('SendEventResolver', {
      typeName: 'Mutation',
      fieldName: 'sendTelegram',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/",
          "params": {
            "headers": {
              "content-type": "application/x-amz-json-1.1",
              "x-amz-target": "AWSEvents.PutEvents"
            },
            "body": {
              "Entries": [
                {
                  "Source": "$ctx.args.source",
                  "DetailType": "$ctx.args.detailType",
                  "Detail": "$util.escapeJavaScript($util.toJson($ctx.args.detail))",
                  "EventBusName": "$ctx.args.eventBus"
                }
              ]
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #set($statusCode = $ctx.result.statusCode)
        #if($statusCode == 200)
          $util.toJson(true)
        #else
          $util.error("Failed to put event", $ctx.result.body)
        #end
      `),
    });

  }
}
