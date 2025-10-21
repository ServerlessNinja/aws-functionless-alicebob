import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as states from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class TelegraphAliceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EventBridge event bus
    const bus = new events.EventBus(this, 'TelegraphStationBus', {
      eventBusName: 'TelegraphStation',
      description: 'Event bus for Telegraph Station',
    });

    // EventBridge archive for custom event bus
    new events.Archive(this, 'TelegraphStationArchive', {
      sourceEventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ]
      },
      archiveName: 'TelegraphStation',
      description: 'Archive for Telegraph Station event bus',
      retention: cdk.Duration.days(30),
    });

    // Secrets Manager secret object
    const secret = new secrets.Secret(this, 'PersonalDiarySecret', {
      secretName: 'PersonalDiary',
      description: 'Personal diary of Alice',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretObjectValue: {
        Who: cdk.SecretValue.unsafePlainText(''),
        When: cdk.SecretValue.unsafePlainText(''),
        Message: cdk.SecretValue.unsafePlainText(''),
        Reaction: cdk.SecretValue.unsafePlainText(''),
      }  
    });

    // SQS queue for unprocessed telegrams
    const queue = new cdk.aws_sqs.Queue(this, 'PostponeQueue', {
      queueName: 'PostponeTrayQueue.fifo',
      fifo: true,
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      contentBasedDeduplication: true,
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'TransmissionAliceStateMachine', {
      stateMachineName: 'TransmissionAlice',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/transmission-alice.asl.yaml'),
      definitionSubstitutions: {
        EVENT_BUS_NAME: bus.eventBusName,
        SECRET_ARN: secret.secretArn,
        QUEUE_URL: queue.queueUrl,
        DYNAMODB_TABLE_NAME: 'TelegraphArchive',
      },
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'TransmissionAliceMachineLogs', {
          logGroupName: '/aws/states/TransmissionAlice',
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        level: states.LogLevel.ALL,
      }
    });

    // IAM permissions for state machine role
    machine.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "ssm:GetParameter*",
          "events:PutEvents",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "sqs:SendMessage",
        ],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/TelegraphArchive`,
          `arn:aws:ssm:*:${this.account}:parameter/AddressBook/*`,
          `arn:aws:events:*:${this.account}:event-bus/TelegraphStation`,
          `arn:aws:secretsmanager:*:${this.account}:secret:PersonalDiary*`,
          queue.queueArn,
        ],
      })
    );

    // IAM permissions for state machine role
    machine.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "comprehend:DetectSentiment",
          "comprehend:BatchDetectSentiment",
        ],
        resources: [ "*" ],
      })
    )

    // CloudWatch log group for EventBridge events
    const logGroup = new logs.LogGroup(this, 'TelegraphEventsLogGroup', {
      logGroupName: '/aws/events/TelegraphStation',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // EventBridge event rule to trigger state machine
    new events.Rule(this, 'ReceiveTelegramRule', {
      ruleName: 'ReceiveTelegram',
      description: 'Start execution of state machine TransmissionAlice',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "IncomingTelegram" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromEventPath('$.detail')
        })
      ]
    });

    // EventBridge event rule to send local events to CloudWatch Logs
    new events.Rule(this, 'TelegramDeliveredRule', {
      ruleName: 'TelegramDelivered',
      description: 'Log events related to received telegrams',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "TelegramDelivered" ]
      },
      enabled: true,
      targets: [
        new targets.CloudWatchLogGroup(logGroup)
      ]
    });

  }
}
