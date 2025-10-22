# Alice & Bob Telegrams

Sample functionless application using AWS managed services: EventBridge, Step Functions, DynamoDB, CloudWatch, SSM Parameter Store, Secret Manager, Translate.

## Overview

**Story:** 

Alice and Bob both work for The Company. Alice is based in Paris and Bob is based in London. Alice and Bob are in long distance relationship, navigating work and love across borders. Bob sends to Alice personal and business telegrams. He also translates to French every telegram sent to Alice. Alice loves receiving private telegrams, reacts with an emoji and saves them in Personal Diary.

*Alice and Bob are fictional characters commonly used as placeholders in discussions about cryptographic systems and protocols. Originally introduced in the 1978 RSA paper by Rivest, Shamir, and Adleman.*

## Diagram

![Aplication Diagram](doc/aws-functionless-alicebob.png)

## Components

This CDK application deploys 3 CDK stacks in 2 regions:

- SharedResourcesStack (primary region)
- SuperPostPrimaryStack (primary region)
- SuperPostSecondaryStack (secondary region)

Application consists of the following AWS resources:

- DynamoDB global tables
- Step Functions state machines
- EventBridge event buses
- EventBridge event rules
- SSM Parameter Store parameters
- Secrets Manager secret
- CloudWatch log groups
- CloudWatch dashboard
- S3 bucket

## Context

Modify the `cdk.context.json` file to change deployment regions:

```json
{
  "regions": {
    "bob": "eu-west-2",
    "alice": "eu-west-3"
  }
}
```

## Start Engine

To start execution of state machines generate a custom EventBridge event in primary region. See sample event file:

[compose-telegram.json](src/events/ompose-telegram.json)

Event detail structure:

```
{
  "from": "Bob",
  "to": "Alice",
  "message": "Some message to send as a telegram. It will get converted to telegram format.",
  "category": "PERSONAL | BUSINESS",
  "priority": "URGENT | STANDARD"
}
```

## Useful commands

* `npm install`           installs all required NPM packages
* `npm run build`         compiles TypeScript to JavaScript
* `cdk synth --all`       emits the synthesized CloudFormation templates
* `cdk deploy --all`      deploys all stacks to your default AWS account
* `cdk destroy --all`     destroys all stacks from your AWS account
