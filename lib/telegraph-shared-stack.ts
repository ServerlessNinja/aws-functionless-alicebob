import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export class TelegraphSharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');
    const locations = this.node.tryGetContext('locations');

    // SSM parameter
    new StringParameter(this, 'AddressBookBob', {
      parameterName: '/AddressBook/Bob/Office',
      stringValue: locations.bob?.address || ''
    });

    // SSM parameter
    new StringParameter(this, 'AddressBookAlice', {
      parameterName: '/AddressBook/Alice/Office',
      stringValue: locations.alice?.address || ''
    });

    // DynamoDB global table
    const table = new dynamodb.TableV2(this, 'TelegraphTable', {
      tableName: 'TelegraphArchive',
      partitionKey: { 
        name: 'telegram_id',
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
        { region: regions.alice }
      ],
    });

    // CloudWatch Dashboard for EventBridge events
    const dashboard = new cloudwatch.Dashboard(this, 'TransmissionsDashboard', {
      dashboardName: 'Transmissions',
      periodOverride: cloudwatch.PeriodOverride.AUTO,
      start: "-PT1H"
    });

    // CloudWatch Logs Insights queries
    const queryLines = {
      bob: [
        'fields detail.telegram_id as TelegramId, detail.from.name as From, detail.to.name as To, detail.message.original as Message, detail.status as Status, detail.service_level as ServiceLevel, detail.sent_at as SentAt',
        'filter source = "Telegraph"',
        'sort @timestamp desc'
      ],
      alice: [
        'fields detail.telegram_id as TelegramId, detail.from.name as From, detail.to.name as To, detail.message.translated as Message, detail.status as Status, detail.reaction as Reaction, detail.received_at as ReceivedAt',
        'filter source = "Telegraph"',
        'sort @timestamp desc'
      ]
    };

    // CloudWatch Logs Insights widgets
    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: `Telegraph Station ${locations.bob?.city}`,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        width: 24,
        height: 6,
        logGroupNames: [ '/aws/events/TelegraphStation' ],
        region: regions.bob,
        queryLines: queryLines.bob
      }),
      new cloudwatch.LogQueryWidget({
        title: `Telegraph Station ${locations.alice?.city}`,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        width: 24,
        height: 6,
        logGroupNames: [ '/aws/events/TelegraphStation' ],
        region: regions.alice,
        queryLines: queryLines.alice
      })
    );

    // Add tags to selected resources for myApplications
    cdk.Tags.of(table).add('cdk:filter', 'Demo');
    cdk.Tags.of(dashboard).add('cdk:filter', 'Demo');

  }
}