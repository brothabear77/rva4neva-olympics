#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { RegistryStack, SiteStack } from "../lib/olympics-stack";

const app = new cdk.App();

// Account and region come from whoever is running this (their AWS login). Leaving the
// account unset when there is no login is what lets `cdk synth` work offline.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

/**
 * Your public IP, allowed to reach the database (for migrations and psql from your own
 * machine). scripts/deploy.ts looks it up and passes it; pass -c adminIp=... by hand
 * otherwise. Optional: without it nothing but the app can reach the database.
 */
const adminIp: string | undefined = app.node.tryGetContext("adminIp") || undefined;
if (adminIp !== undefined && !/^(\d{1,3})(\.\d{1,3}){3}$/.test(adminIp)) {
  throw new Error(`adminIp must be a plain IPv4 address like 203.0.113.7, got "${adminIp}"`);
}

/** Which container image to run. deploy.ts pushes a uniquely tagged image and passes it here. */
const imageTag: string = app.node.tryGetContext("imageTag") || "latest";

new RegistryStack(app, "OlympicsRegistry", { env });
new SiteStack(app, "OlympicsSite", { env, imageTag, adminIp });

cdk.Tags.of(app).add("project", "rva4neva-olympics");
