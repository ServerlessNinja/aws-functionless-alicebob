import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as states from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class TelegraphSecondaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EventBridge event bus
    const bus = new events.EventBus(this, 'TelegraphStationBus', {
      eventBusName: 'TelegraphStation'
    });

    // Secrets Manager secret object
    const secret = new secrets.Secret(this, 'PersonalDiarySecret', {
      secretName: 'PersonalDiary',
      description: 'Personal diary of Alice',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretObjectValue: {
        heartsBob: cdk.SecretValue.unsafePlainText('0'),
        // heartPurple: cdk.SecretValue.unsafePlainText(Buffer.from('💜').toString('base64')),
        // heartBlue: cdk.SecretValue.unsafePlainText(Buffer.from('💙').toString('base64')),
        // heartYellow: cdk.SecretValue.unsafePlainText(Buffer.from('💛').toString('base64')),
      }  
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'TransmissionAliceStateMachine', {
      stateMachineName: 'TransmissionAlice',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/transmission-alice-sm.yaml'),
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
        ],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/TelegraphArchive`,
          `arn:aws:ssm:*:${this.account}:parameter/Telegraph/*`,
          `arn:aws:events:*:${this.account}:event-bus/TelegraphStation`,
          `arn:aws:secretsmanager:*:${this.account}:secret:PersonalDiary*`
        ],
      })
    );

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
        detailType: [ "NewTelegram" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromEventPath('$.detail')
        })
      ]
    });

    // EventBridge event rule to send local events to CloudWatch Logs
    new events.Rule(this, 'TelegramReceivedRule', {
      ruleName: 'TelegramReceived',
      description: 'Log events related to collected letters',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "TelegramReceived" ]
      },
      enabled: true,
      targets: [
        new targets.CloudWatchLogGroup(logGroup)
      ]
    });

  }
}
