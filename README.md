# ALB + ECS Fargate with Auto Scaling
Application Load Balancer (ALB) とECS Fargateを使用してNode.jsアプリケーションをデプロイし、CPU使用率ベースの自動スケーリングを実装した環境を構築。

![名称未設定ファイル drawio (3)](https://github.com/user-attachments/assets/668c317b-a196-4291-8e32-2787b305e97f)

## 前提条件

- AWS CLIが設定済みであること
- AWS CDKがインストール済みであること
- 必要なAWS権限が設定されていること

## 手順

### デプロイ実行
```bash
cdk deploy
```

### デプロイ後の出力値確認
```
SimpleAlbEcsStack.LoadBalancerDNS
SimpleAlbEcsStack.ApiEndpoint
```

### アプリケーションへのアクセス

#### API情報エンドポイントへのアクセス
ALB により `instance` の値が切り替わることを確認
```bash
curl http://<LoadBalancer-DNS>/api/info
```

### 自動スケーリングのテスト

#### 負荷をかけてスケーリングを確認
デプロイ後の出力から取得したコマンドを実行：
```bash
while true; do curl -s http://<LoadBalancer-DNS>/api/load > /dev/null; done
```
