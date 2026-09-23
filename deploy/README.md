# 阿里云隔离部署（10 小时 MVP）

目标域名固定为 `https://submit.otherworld-studio.cn`。本说明只部署本项目，不修改服务器上已有项目的运行时、数据库或反向代理配置；执行前先备份现有代理配置。

## 1. 隔离边界

- 目录：`/srv/chinavr-submission`，不要放到其他项目目录。
- 进程：独立的 `chinavr-submission.service`；监听 `127.0.0.1:3017`，不占用已有项目端口。
- 数据库：独立 PostgreSQL 数据库 `chinavr_submission` 和账号 `chinavr_submission`。不得复用其他项目的库或账号。
- 数据、日志、备份：分别放在 `/var/lib/chinavr-submission`、`/var/log/chinavr-submission`、`/var/backups/chinavr-submission`。
- 反向代理：只新增 `submit.otherworld-studio.cn` 的独立 server 配置；不要覆盖现有站点配置。

## 2. 部署前检查

在服务器上以具备 sudo 权限的运维账号执行，先记录现有状态：

```bash
sudo ss -ltnp
sudo nginx -T > /var/backups/nginx-before-chinavr-$(date +%F-%H%M%S).conf
df -h
free -h
```

确认 `3017` 未被占用，并确认 DNS 已将 `submit.otherworld-studio.cn` 的 A 记录指向此服务器公网 IP。阿里云安全组只开放 `80/443`；应用端口 `3017` 和 PostgreSQL 端口不得对公网开放。

## 3. 代码与依赖

将仓库放入独立目录后执行：

```bash
sudo install -d -m 0750 /srv/chinavr-submission
sudo chown -R "$USER":"$USER" /srv/chinavr-submission
cd /srv/chinavr-submission
git clone https://github.com/shrrrrrrrr/AIGC-submission-system.git .
npm ci
npm run build
npm run web:build
```

前端产物在 `/srv/chinavr-submission/web/dist`，后端产物在 `/srv/chinavr-submission/dist/src/server.js`。

## 4. 独立 PostgreSQL

如果服务器已有 PostgreSQL，创建独立账号和库，不改其他库：

```sql
CREATE ROLE chinavr_submission LOGIN PASSWORD '<随机长密码>';
CREATE DATABASE chinavr_submission OWNER chinavr_submission;
```

然后仅对新库执行迁移，并保存迁移前备份：

```bash
pg_dump --format=custom --file=/var/backups/chinavr-submission/pre-migration.dump \
  --dbname='postgresql://chinavr_submission:<密码>@127.0.0.1:5432/chinavr_submission'
for f in db/migrations/001_auth.up.sql db/migrations/002_mfa_credentials.up.sql db/migrations/003_submissions.up.sql; do
  psql 'postgresql://chinavr_submission:<密码>@127.0.0.1:5432/chinavr_submission' -v ON_ERROR_STOP=1 -f "$f"
done
```

## 5. 生产环境变量

将真实值放在服务器权限为 `0600` 的 `/etc/chinavr-submission.env`，不要提交 Git：

```dotenv
NODE_ENV=production
PORT=3017
DATABASE_URL=postgresql://chinavr_submission:<密码>@127.0.0.1:5432/chinavr_submission
MFA_ENCRYPTION_KEY=<32字节base64url>
APP_PUBLIC_URL=https://submit.otherworld-studio.cn
MAILER_MODE=directmail
MAILER_ACCESS_KEY_ID=<RAM AccessKey ID>
MAILER_ACCESS_KEY_SECRET=<RAM AccessKey Secret>
MAILER_REGION=cn-hangzhou
MAILER_ENDPOINT=dm.aliyuncs.com
MAILER_FROM_ADDRESS=<已验证发信地址>
APPROVED_VIDEO_PLATFORMS=douyin.com,www.douyin.com,v.douyin.com,iesdouyin.com,bilibili.com,www.bilibili.com,b23.tv,xiaohongshu.com,www.xiaohongshu.com,xhslink.com,weixin.qq.com,www.weixin.qq.com,channels.weixin.qq.com
```

DirectMail 的 RAM 身份只授予本项目所需的发信权限；AccessKey 只放在该 env 文件，不能写入仓库、聊天或网页。

## 6. 独立 systemd 服务

创建 `/etc/systemd/system/chinavr-submission.service`：

```ini
[Unit]
Description=ChinaVR submission MVP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/srv/chinavr-submission
EnvironmentFile=/etc/chinavr-submission.env
ExecStart=/usr/bin/node /srv/chinavr-submission/dist/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/chinavr-submission /var/log/chinavr-submission

[Install]
WantedBy=multi-user.target
```

启用后先看日志，再接入代理：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chinavr-submission
sudo systemctl status chinavr-submission --no-pager
curl -i http://127.0.0.1:3017/api/v1/me
```

未看到 `mode=postgres` 且服务健康前，不进行公网发布。

## 7. 反向代理与 HTTPS

现有 Nginx 只新增一个独立站点：静态文件根目录指向 `/srv/chinavr-submission/web/dist`，`/api/` 反代到 `http://127.0.0.1:3017`，并保留 `Host`、真实 IP 和 HTTPS。先用 HTTP 验证 DNS，再用阿里云证书或 Certbot 为该子域名签发证书；证书只绑定此子域名。修改前后分别执行 `nginx -t`，确认无误后再 reload。

## 8. 最小上线测试

从手机蜂窝网络完成：

1. 打开 `https://submit.otherworld-studio.cn`，首页资源无 404。
2. 注册一个测试邮箱，确认邮件链接为 `https://submit.otherworld-studio.cn/...`，不是 `localhost`。
3. 点击验证链接后登录，创建草稿并保存作品名称。
4. 分别用抖音、B 站、小红书、视频号各一条公开 HTTPS 链接测试白名单；只验证“保存为 pending”，不做正式评审流程。
5. 验证完成后再公开二维码。回滚时停止本服务并恢复本项目自己的代理配置和数据库备份，不触碰其他项目。
