#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TelegraphPrimaryStack } from '../lib/telegraph-primary-stack';
import { TelegraphSecondaryStack } from '../lib/telegraph-secondary-stack';
import { TelegraphSharedStack } from '../lib/telegraph-shared-stack';

const app = new cdk.App();
const regions = app.node.tryGetContext('regions');

const sharedStack = new TelegraphSharedStack(app, 'TelegraphSharedStack', {
  env: { region: regions.primary }
});

const primaryStack = new TelegraphPrimaryStack(app, 'TelegraphPrimaryStack', {
  env: { region: regions.primary }
});

const secondaryStack = new TelegraphSecondaryStack(app, 'TelegraphSecondaryStack', {
  env: { region: regions.secondary }
});

secondaryStack.addDependency(sharedStack);
primaryStack.addDependency(sharedStack);
primaryStack.addDependency(secondaryStack);