import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

import { Construct } from 'constructs';

import path = require('path');

export class SimpleAlbEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'EcsVpc', {
      maxAzs: 2,
      cidr: '10.0.0.0/16',
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ],
      natGateways: 1
    });

    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: vpc,
      containerInsights: true
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 512,
      cpu: 256
    });

    const container = taskDefinition.addContainer('NodejsContainer', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../src')),
      memoryLimitMiB: 512,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'nodejs-api'
      })
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP
    });

    // ALB用セキュリティグループ
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true
    });

    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic from internet');

    // ECS用セキュリティグループ
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true
    });

    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(3000), 'Allow traffic from ALB');

    // ALB作成
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: vpc,
      internetFacing: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: albSecurityGroup
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      }
    });

    alb.addListener('Listener', {
      port: 80,
      defaultTargetGroups: [targetGroup]
    });

    // // WAF v2 Web ACL作成（日本以外からのアクセスをブロック）
    // const webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
    //   name: 'JapanOnlyWebACL',
    //   scope: 'REGIONAL',
    //   defaultAction: {
    //     block: {} // デフォルトで全ブロック
    //   },
    //   rules: [
    //     {
    //       name: 'AllowJapanOnly',
    //       priority: 1,
    //       statement: {
    //         geoMatchStatement: {
    //           countryCodes: ['US'] // 日本のみ許可
    //         }
    //       },
    //       action: {
    //         allow: {} // 日本からのアクセスは許可
    //       },
    //       visibilityConfig: {
    //         sampledRequestsEnabled: true,
    //         cloudWatchMetricsEnabled: true,
    //         metricName: 'AllowJapanOnlyRule'
    //       }
    //     },
    //     {
    //       name: 'AWSManagedRulesCommonRuleSet',
    //       priority: 2,
    //       overrideAction: {
    //         none: {}
    //       },
    //       statement: {
    //         managedRuleGroupStatement: {
    //           vendorName: 'AWS',
    //           name: 'AWSManagedRulesCommonRuleSet'
    //         }
    //       },
    //       visibilityConfig: {
    //         sampledRequestsEnabled: true,
    //         cloudWatchMetricsEnabled: true,
    //         metricName: 'CommonRuleSetMetric'
    //       }
    //     }
    //   ],
    //   visibilityConfig: {
    //     sampledRequestsEnabled: true,
    //     cloudWatchMetricsEnabled: true,
    //     metricName: 'JapanOnlyWebACL'
    //   }
    // });

    // WAF v2 Web ACL作成（アメリカ以外からのアクセスをブロック）
    const webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      name: 'USOnlyWebACL',
      scope: 'REGIONAL',
      defaultAction: {
        block: {} // デフォルトで全ブロック
      },
      rules: [
        {
          name: 'AllowUSOnly',
          priority: 1,
          statement: {
            geoMatchStatement: {
              countryCodes: ['US'] // アメリカのみ許可
            }
          },
          action: {
            allow: {} // アメリカからのアクセスは許可
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowUSOnlyRule'
          }
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: {
            none: {}
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric'
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'USOnlyWebACL'
      }
    });

    new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: alb.loadBalancerArn,
      webAclArn: webAcl.attrArn
    });

    // ECSサービス作成
    const service = new ecs.FargateService(this, 'Service', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 2,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [ecsSecurityGroup]
    });

    service.attachToApplicationTargetGroup(targetGroup);

    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3
    });

    // CPU使用率ベースのスケーリング
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 30,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });

    // -------------------------------------------------------------

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name'
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: `http://${alb.loadBalancerDnsName}/api/info`,
      description: 'API Info Endpoint (for load balancing test)'
    });

    new cdk.CfnOutput(this, 'StressTestCommand', {
      value: `while true; do curl -s http://${alb.loadBalancerDnsName}/api/load > /dev/null; done`,
      description: 'Run this command to trigger AutoScaling (Ctrl+C to stop)'
    });

    new cdk.CfnOutput(this, 'WebACLArn', {
      value: webAcl.attrArn,
      description: 'WAF Web ACL ARN'
    });
  }
}
