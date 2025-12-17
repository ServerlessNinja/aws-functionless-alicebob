#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TelegraphSharedStack } from '../lib/telegraph-shared-stack';
import { TelegraphAliceStack } from '../lib/telegraph-alice-stack';
import { TelegraphBobStack } from '../lib/telegraph-bob-stack';
import { TelegraphApiStack } from '../lib/telegraph-api-stack';

const app = new cdk.App();
const regions = app.node.tryGetContext('regions');

// Define shared stack (#1)
const sharedStack = new TelegraphSharedStack(app, 'TelegraphSharedStack', {
  env: { region: regions.bob }
});

// Define Alice's stack (#2)
const aliceStack = new TelegraphAliceStack(app, 'TelegraphAliceStack', {
  env: { region: regions.alice }
});

// Define Bob's stack (#3)
const bobStack = new TelegraphBobStack(app, 'TelegraphBobStack', {
  env: { region: regions.bob }
});

// Define GUI stack (#4)
const apiStack = new TelegraphApiStack(app, 'TelegraphApiStack', {
  env: { region: regions.bob }
});

// Set stack dependencies for deployment order
aliceStack.addDependency(sharedStack);
bobStack.addDependency(sharedStack);
bobStack.addDependency(aliceStack);
apiStack.addDependency(bobStack);

// Add tags to stacks and resources
cdk.Tags.of(sharedStack).add('cdk:stack', 'Shared');
cdk.Tags.of(aliceStack).add('cdk:stack', 'Alice');
cdk.Tags.of(bobStack).add('cdk:stack', 'Bob');
cdk.Tags.of(apiStack).add('cdk:stack', 'API');