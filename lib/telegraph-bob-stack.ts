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

    // EventBridge event bus
    const bus = new events.EventBus(this, 'TelegraphStationBus', {
      eventBusName: 'TelegraphStation'
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'TransmissionBobStateMachine', {
      stateMachineName: 'Transmission-Bob',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/transmission-bob.asl.yaml'),
      definitionSubstitutions: {
        EVENT_BUS_NAME: bus.eventBusName,
        DYNAMODB_TABLE_NAME: 'TelegraphArchive',
      },
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'TransmissionBobStateMachineLogs', {
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
          // "states:StartExecution",
          // "states:StopExecution",
          // "states:DescribeExecution",
          // "bedrock:InvokeModel",
        ],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/TelegraphArchive`,
          `arn:aws:ssm:*:${this.account}:parameter/AddressBook/*`,
          `arn:aws:events:*:${this.account}:event-bus/TelegraphStation`,
          // `arn:aws:states:*:${this.account}:stateMachine:Transmission*`,
          // `arn:aws:states:*:${this.account}:execution:Transmission*:*`,
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

    // EventBridge event rule to trigger state machine
    new events.Rule(this, 'StartTransmissionRule', {
      ruleName: 'Start',
      description: 'Start execution of state machine TransmissionBob',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "Start" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromEventPath('$.detail')
        })
      ]
    });

    // CloudWatch log group for EventBridge events
    const logGroup = new logs.LogGroup(this, 'TelegraphStationEventsLogGroup', {
      logGroupName: '/aws/events/TelegraphStation',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // EventBridge event rule to send events to remote event bus
    new events.Rule(this, 'TransmitTelegramRule', {
      ruleName: 'TransmitTelegram',
      description: 'Send events to remote event bus (cross-region)',
      eventBus: bus,
      eventPattern: {
        source: [ "Telegraph" ],
        detailType: [ "NewTelegram" ]
      },
      enabled: true,
      targets: [
        new targets.CloudWatchLogGroup(logGroup),
        new targets.EventBus(
          events.EventBus.fromEventBusArn(this, 'TelegraphStation2', 
            `arn:aws:events:${regions.alice}:${this.account}:event-bus/TelegraphStation`
          )
        )
      ]
    });

  }
}
