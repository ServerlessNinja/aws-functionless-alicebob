import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as s3 from 'aws-cdk-lib/aws-s3';
// import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export class TelegraphSharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');
    const locations = this.node.tryGetContext('locations');

    // SSM parameters
    new StringParameter(this, 'AddressBookEntry1', {
      parameterName: '/Telegraph/AddressBook/Bob/Office',
      stringValue: locations.primary?.address || ''
    });

    new StringParameter(this, 'AddressBookEntry2', {
      parameterName: '/Telegraph/AddressBook/Alice/Office',
      stringValue: locations.secondary?.address || ''
    });

    // DynamoDB global table
    new dynamodb.TableV2(this, 'TelegraphArchiveTable', {
      tableName: 'TelegraphArchive',
      partitionKey: { 
        name: 'telegramId',
        type: dynamodb.AttributeType.STRING
      },
      billing: dynamodb.Billing.onDemand(),
      tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      pointInTimeRecoverySpecification: { 
        pointInTimeRecoveryEnabled: false
      },
      replicas: [
        { region: regions.secondary }
      ],
    });

    // CloudWatch Dashboard for EventBridge events
    const dashboard = new cloudwatch.Dashboard(this, 'CwDashboard', {
      dashboardName: 'Telegraph',
      periodOverride: cloudwatch.PeriodOverride.AUTO,
      start: "-PT1H"
    });

    const queryLines = {
      primary: [
        'fields detail.telegramId as TelegramId, detail.sender.name as From, detail.recipient.name as To, detail.message.topic as Topic, detail.status as Status, detail.documentType as Type, detail.updatedAt as UpdatedAt',
        'filter source = "Telegraph"',
        'sort @timestamp desc'
      ],
      secondary: [
        'fields detail.telegramId as TelegramId, detail.sender.name as From, detail.recipient.name as To, detail.topic as Topic, detail.status as Status, detail.reaction as Reaction, detail.updatedAt as UpdatedAt',
        'filter source = "Telegraph"',
        'sort @timestamp desc'
      ]
    };

    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: `Telegraph Station ${locations.primary?.city}`,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        width: 24,
        height: 6,
        logGroupNames: [ '/aws/events/TelegraphStation' ],
        region: regions.primary,
        queryLines: queryLines.primary
      }),
      new cloudwatch.LogQueryWidget({
        title: `Telegraph Station ${locations.secondary?.city}`,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        width: 24,
        height: 6,
        logGroupNames: [ '/aws/events/TelegraphStation' ],
        region: regions.secondary,
        queryLines: queryLines.secondary
      })
    );

  }
}