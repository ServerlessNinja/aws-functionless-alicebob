import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as states from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class TelegraphBobStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');
    const locations = this.node.tryGetContext('locations');

    // EventBridge custom event bus
    const bus = new events.EventBus(this, 'TelegraphBus', {
      eventBusName: 'TelegraphStation' + locations?.bob?.city,
      description: 'Event bus for Telegraph Station',
    });

    // EventBridge archive for custom event bus
    const archive = new events.Archive(this, 'TelegraphArchive1', {
      sourceEventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
      },
      archiveName: 'TelegraphStation' + locations?.bob?.city,
      description: 'Archive for Telegraph Station event bus',
      retention: cdk.Duration.days(30),
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'TransmissionStateMachine', {
      stateMachineName: 'TransmissionBob',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/transmission-bob.asl.yaml'),
      definitionSubstitutions: {
        EVENT_BUS_NAME: bus.eventBusName,
        DYNAMODB_TABLE_NAME: 'TelegraphArchive',
      },
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'TransmissionLogs', {
          logGroupName: '/aws/states/TransmissionBob',
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
        ],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/TelegraphArchive*`,
          `arn:aws:ssm:*:${this.account}:parameter/AddressBook/*`,
          `arn:aws:events:*:${this.account}:event-bus/TelegraphStation*`,
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
          "translate:TranslateText",
          "translate:TranslateDocument"
        ],
        resources: [ "*" ],
      })
    )

    // EventBridge event rule to trigger state machine execution
    new events.Rule(this, 'ComposeRule', {
      ruleName: 'ComposeTelegram',
      description: 'Start execution of state machine TransmissionBob',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "ComposeTelegram" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromObject({
            eventId: events.EventField.fromPath('$.id'),
            payload: events.EventField.fromPath('$.detail'),
          })
        })
      ]
    });

    // CloudWatch log group for EventBridge events
    const logGroup = new logs.LogGroup(this, 'TelegraphLogs', {
      logGroupName: '/aws/events/TelegraphStation',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // EventBridge event rule to send events to remote event bus
    new events.Rule(this, 'TransmitRule', {
      ruleName: 'TransmitTelegram',
      description: 'Send events to remote event bus (cross-region)',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "IncomingTelegram" ]
      },
      enabled: true,
      targets: [
        new targets.CloudWatchLogGroup(logGroup),
        new targets.EventBus(
          events.EventBus.fromEventBusArn(this, 'TelegraphBusRemote', 
            `arn:aws:events:${regions.alice}:${this.account}:event-bus/TelegraphStation${locations?.alice?.city}`
          )
        )
      ]
    });

    // Add tags to selected resources for myApplications
    cdk.Tags.of(bus).add('cdk:filter', 'Demo');
    cdk.Tags.of(archive).add('cdk:filter', 'Demo');
    cdk.Tags.of(machine).add('cdk:filter', 'Demo');

  }
}
