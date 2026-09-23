# 阿里云隔离部署最终方案

方案日期：2026-09-23。目标地址：`https://submit.otherworld-studio.cn`。

本文是后续部署的统一依据，共 **14 步**。指导操作使用“第 X 步/14”，一个步骤验收后再继续。方案定稿不代表部署已完成；带占位符的配置在对应步骤确定后替换，不要整篇复制执行。

本站保存账户、投稿信息和外部作品链接，不接收、托管或下载视频。先完成受限内测，对公众开放须通过第 14 步验收。

## 已执行操作与衔接

截至本次修订，根据用户提供的输出及确认：

- 已通过 Workbench 进入北京地域的 Ubuntu 24.04.4 LTS 实例，规格为 4 核 8 GiB。
- 已完成三轮只读检查：当时未发现运行中的网站、Node.js、PostgreSQL 或 Docker，常用项目目录为空。文件搜索曾截取前 200 行，不能据此证明整台服务器绝无其他项目。
- 用户已确认创建系统盘快照；安装前还须确认状态为“成功”，记录快照 ID。
- 已创建 `chinavr` 用户和旧目录 `/opt/chinavr-submission`、`/var/lib/chinavr`、`/var/log/chinavr`、`/etc/chinavr`、`/var/backups/chinavr`。这些操作无须回滚，但命名与最终方案不同；暂时保留、不使用、不删除或改名。
- 尚未收到最终用户 `chinavr_submission` 和最终目录创建成功的输出，当前从 **第 3 步/14** 衔接。旧编号前三步合并为新第 1 步，旧第 4 步对应新第 2 步，旧第 5 步需按新第 3 步补齐。

系统盘约 70 GiB，先使用其剩余空间。150 GiB 数据盘 `/dev/vdb` 未显示文件系统和挂载点，不能据此认定没有数据；本方案不格式化、初始化或挂载该盘。

## 固定隔离边界

| 项目 | 最终约定 |
| --- | --- |
| 应用 Linux 用户/组 | `chinavr_submission`，禁止交互登录、无 sudo 权限 |
| 构建 Linux 用户 | `chinavr_build`，与生产运行身份分开，无 sudo 权限 |
| 代码 | `/srv/chinavr-submission/releases/<完整提交SHA>`，`current` 指向当前版本 |
| 构建目录 | `/srv/chinavr-build`，仅构建用户使用，不放生产密钥 |
| Node.js | `/opt/chinavr-runtime` 下的固定版本，`node` 链接指向选定版本 |
| 应用服务 | `chinavr-submission.service`，仅监听 `127.0.0.1:3017` |
| PostgreSQL | 独立 PostgreSQL 16 集群 `chinavr`，服务 `postgresql@16-chinavr.service` |
| 数据库端口 | `127.0.0.1:5433`，区别于常见默认端口 `5432` |
| 数据库/运行账号 | 数据库 `chinavr_submission`，运行账号 `chinavr_submission` |
| 迁移账号 | `chinavr_migrator`，拥有本项目数据库，不交给应用使用 |
| 数据库文件 | `/var/lib/postgresql/16/chinavr`，归系统用户 `postgres` 管理 |
| 应用数据/日志 | `/var/lib/chinavr-submission`、`/var/log/chinavr-submission` |
| 环境变量 | `/etc/chinavr-submission.env`，`root:root`、`0600` |
| 备份 | `/var/backups/chinavr-submission`，`root:root`、`0700` |
| 站点 | 只新增 `submit.otherworld-studio.cn` 的配置、证书及日志 |

这是同机账户、文件、进程、数据库和资源限制隔离，仍共享内核、硬件及管理员。需要独立故障域或隔离不受信任的管理员时，使用另一台 ECS。测试环境不得使用正式库、正式密钥或真实参赛数据；长期测试环境另设用户、服务、端口和数据库。

相较初版，数据库加强为专用集群，端口统一为 `5433`，不再使用初版的 `5432` 连接字符串。

## 第 1 步/14：检查实例与冲突

确认实例、公网 IP 和登录主机一致，保存目录、端口、服务、资源余量与安全组记录，确认 `3017`、`5433` 空闲。没有运行某个服务不等于没有安装，安装前另查软件包及配置。

```bash
hostnamectl
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS
df -hT
free -h
sudo ss -lntup
sudo systemctl list-units --type=service --state=running --no-pager
```

安全组保留现有合法规则：网站使用 `80/443`，SSH `22` 保留受限运维 IP 和所需 Workbench 来源。不要为了“只开放 80/443”删除 SSH 规则。`3017`、`5432`、`5433` 不向公网开放，本项目应用和数据库也不监听私网网卡。

验收：记录现状、无端口和目录冲突；发现其他项目后补充边界再继续。

## 第 2 步/14：准备恢复点

确认系统盘部署前手动快照状态为“成功”，记录名称、ID、时间和保留安排。创建与保留快照产生存储费用，不额外启用归档或跨地域复制。

后续若发现已有 Nginx，修改前将配置备份到本项目受限备份目录，保存 `nginx -T` 结果；未安装时跳过。配置可能含敏感信息，不发到聊天或 Git。

验收：快照成功、对象正确。整盘恢复影响整块系统盘，不能作为未来多项目共存时本项目的常规回滚手段。

## 第 3 步/14：建立最终系统账户和目录

只创建最终账户和目录。若同名资源已有未知用途，先核对，不接管其他项目资源。以下命令仅在相关目录不存在或已经确认为本次部署创建时执行。

```bash
sudo bash <<'BASH'
set -euo pipefail
if ! id chinavr_submission >/dev/null 2>&1; then
  useradd --system --user-group \
    --home-dir /var/lib/chinavr-submission --create-home \
    --shell /usr/sbin/nologin chinavr_submission
fi
install -d -o root -g chinavr_submission -m 0750 /srv/chinavr-submission
install -d -o root -g chinavr_submission -m 0750 /srv/chinavr-submission/releases
install -d -o chinavr_submission -g chinavr_submission -m 0750 /var/lib/chinavr-submission
install -d -o chinavr_submission -g chinavr_submission -m 0750 /var/log/chinavr-submission
install -d -o root -g root -m 0700 /var/backups/chinavr-submission
install -d -o root -g root -m 0755 /opt/chinavr-runtime
id chinavr_submission
ls -ld /srv/chinavr-submission /srv/chinavr-submission/releases \
  /var/lib/chinavr-submission /var/log/chinavr-submission \
  /var/backups/chinavr-submission /opt/chinavr-runtime
BASH
```

验收：运行用户无管理员组；代码目录归 root，应用只拥有数据及应用日志目录写权限，不能改写发行代码或删除备份。

## 第 4 步/14：准备可追踪代码

创建无登录、无 sudo 权限的 `chinavr_build` 用户，家目录和构建目录为 `/srv/chinavr-build`，归本人、权限 `0700`。该用户不加入应用组，不读取生产配置。

从仓库 [AIGC-submission-system](https://github.com/shrrrrrrrr/AIGC-submission-system) 获取经确认的完整提交 SHA，在构建目录检出该提交。仓库不可访问时，由开发机从同一已检查提交打包，经 Workbench 上传并核对 SHA-256。

不整体上传开发工作目录或 Windows `node_modules`；排除真实 `.env`、私钥、令牌、用户数据和无关图片。正式前端资源必须进入所选提交。私有仓库凭证通过私密认证配置，不嵌入 Git URL、命令或聊天，不为部署而公开仓库。

验收：记录 SHA/包校验值，代码完整且无生产秘密，尚不接入公网。

## 第 5 步/14：安装独立 Node.js

当前 `package.json` 要求 `node >=26.0.0`。安装时核对官方发布、安全维护状态和项目测试，固定具体 Node.js 26 补丁版本，不自动认定该主版本当时已进入 LTS。

从官方源获取 Linux x64 包并验证官方校验值，安装至 `/opt/chinavr-runtime/node-v<固定版本>-linux-x64`，归 root；`/opt/chinavr-runtime/node` 仅指向选定版本。

所有构建和启动明确使用该路径，不替换 `/usr/bin/node`、全局 npm 包或其他项目 nvm 配置。缺失系统工具时先审阅 apt 安装计划，只安装所需包，不执行整机升级或无关服务重启。

验收：通过独立路径查询 Node.js/npm 版本，记录兼容测试结果。

## 第 6 步/14：准备专用 PostgreSQL 集群

先查 PostgreSQL 软件包、`pg_lsclusters`、端口及配置。没有软件时安装 Ubuntu 官方源的 PostgreSQL 16 及所需扩展包，先评估安装可能自动创建/启动默认 `main` 集群的行为；不要删除或重建未知集群。若安装计划可能影响其他项目，先明确影响并取得确认。

本项目使用 `pg_createcluster` 创建独立 `16/chinavr` 集群，端口 `5433`，配置在 `/etc/postgresql/16/chinavr`，数据在 `/var/lib/postgresql/16/chinavr`。同名集群或端口已存在时先核对。

```ini
listen_addresses = '127.0.0.1'
port = 5433
password_encryption = 'scram-sha-256'
max_connections = 40
shared_buffers = '256MB'
```

本集群 `pg_hba.conf` 仅允许本地 `postgres` 管理员通过 peer 管理，以及本项目账号通过 `127.0.0.1/32`、SCRAM 访问授权库；演练库仅允许迁移账号。备份账号在第 14 步单独增加。其余连接拒绝，检查规则顺序，不能保留排在前面的宽泛放行规则。

只管理 `postgresql@16-chinavr.service`，不批量重启通用 PostgreSQL 服务。为该单元设置独立资源限额，初始预算 `MemoryHigh=1G`、`MemoryMax=1536M`、`CPUQuota=100%`，测试后按实际峰值校准。

验收：专用集群仅监听 `127.0.0.1:5433`，其他集群状态不变。限额能减少资源争抢，但触顶可能引起本服务故障，须监控。

## 第 7 步/14：数据库与最小权限账号

明确连接本项目 `5433` 集群，创建 `chinavr_migrator` 迁移账号、`chinavr_submission` 运行账号和 `chinavr_submission` 数据库，数据库所有者为迁移账号。

两个账号均禁止超级用户、创建其他数据库、创建角色、复制和绕过 RLS，应用不是迁移角色成员。密码使用 `createuser --pwprompt` 或 psql 的 `\password` 私密交互设置，不写进命令参数或 SQL 文件。

仅对本项目库撤销 PUBLIC 的 CONNECT 权限，按需授权；撤销 public schema 的 PUBLIC CREATE 权限。迁移后向运行账号授予 schema USAGE、业务表 SELECT/INSERT/UPDATE/DELETE、序列 USAGE/SELECT。审计表仅追加及必要查询，不允许修改历史；应用不拥有 CREATE/ALTER/DROP/TRUNCATE 权限。未来迁移的默认权限与审计表权限也需记录。

验收：运行账号可以访问本项目库，不能访问演练库或执行 DDL；数据库管理员和 root 仍属于受信任身份。

## 第 8 步/14：迁移、备份及恢复演练

先阅读 `db/README.md` 和选定提交的迁移。在本集群新建隔离空演练库 `chinavr_submission_rehearsal`，执行迁移、约束和 down 脚本演练，不在其他项目库测试。

正式库迁移前由运维执行 `pg_dump -Fc`，保存带时间/提交标识的备份至本项目备份目录、权限 `0600`，记录 SHA-256。使用私密交互密码或运维专用 `0600` 的 `PGPASSFILE`；应用无权访问备份。备份失败即停止；除 `pg_restore --list` 检查，还需在演练库实际恢复。

当前首次初始化只对已确认无业务表的目标库执行以下命令，工作目录为已检查源码根目录：

```bash
psql -X -W -h 127.0.0.1 -p 5433 \
  -U chinavr_migrator -d chinavr_submission \
  -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET lock_timeout = '5s'; SET statement_timeout = '60s';" \
  -f db/migrations/001_auth.up.sql \
  -f db/migrations/002_mfa_credentials.up.sql \
  -f db/migrations/003_submissions.up.sql
```

当前三份脚本可放在一次事务执行，错误整批回滚；未来迁移重新审阅事务兼容性。不得重复执行非幂等脚本，记录脚本校验值和执行结果，同一时间只允许一名迁移操作者。迁移后授予第 7 步权限。

验收：真实数据库的注册、会话、草稿、重复请求、并发及约束测试通过，并实际恢复成功。模拟数据库测试不替代这些检查。

## 第 9 步/14：配置生产密钥

通过服务器私密编辑流程创建 `/etc/chinavr-submission.env`，权限 `root:root 0600`。不要使用含真实密钥的 shell 命令，不将文件截图或发送到聊天。

```dotenv
NODE_ENV=production
PORT=3017
SESSION_TTL_SECONDS=28800
DATABASE_URL=postgresql://chinavr_submission:<运行账号密码经URL编码>@127.0.0.1:5433/chinavr_submission
PG_POOL_MAX=10
PG_IDLE_TIMEOUT_MS=30000
PG_CONNECTION_TIMEOUT_MS=5000
MFA_ENCRYPTION_KEY=<固定32字节随机密钥的无填充base64url编码>
APP_PUBLIC_URL=https://submit.otherworld-studio.cn
MAILER_MODE=directmail
MAILER_ACCESS_KEY_ID=<本项目RAM身份的AccessKey ID>
MAILER_ACCESS_KEY_SECRET=<对应Secret>
MAILER_REGION=cn-hangzhou
MAILER_ENDPOINT=dm.aliyuncs.com
MAILER_FROM_ADDRESS=<已验证发信地址>
APPROVED_VIDEO_PLATFORMS=<按实际链接核验的精确主机名列表>
```

平台候选列表见 `.env.example`，至少各核验一条拟支持平台的真实 HTTPS 链接；匹配主机名不代表作品审核或访问预检已通过。

DirectMail 使用项目专用、最小发信权限 RAM 身份。MFA 密钥持久保存并加密备份，重新部署不重新生成。环境文件由 systemd 系统管理器读取并传给应用，运行进程必然持有所需秘密；排查时不要打印完整进程环境。前端构建不能读取该文件，秘密不得写入 `VITE_*`。

验收：权限正确、占位符已替换、发信可用，秘密没有进入仓库、命令历史或前端产物。

## 第 10 步/14：构建并固定发行版本

在 `chinavr_build` 工作目录，以构建用户身份使用独立 Node.js 路径执行：

```bash
export PATH=/opt/chinavr-runtime/node/bin:/usr/bin:/bin
npm ci
npm run typecheck
npm run web:typecheck
npm test
npm run build
npm run web:build
```

逐条确认成功再继续，不以 root 执行 npm 脚本。构建及原生依赖须在 Linux x64 环境产生。

**当前代码必修项：** 本次核对 `src/server.ts` 仍使用 `serve({ fetch: app.fetch, port })`。发行提交必须明确设置 `hostname: "127.0.0.1"` 并验证；只增加一个代码没有读取的 HOST 环境变量无效。未完成前不得发布。本次文档修订没有代替开发端修改代码。

通过后，由运维把 Linux 运行依赖、`dist`、`web/dist`、必要迁移及版本说明安装到 `/srv/chinavr-submission/releases/<完整SHA>`，归 `root:chinavr_submission`，应用只读并保留必要可执行位。不要复制生产 env、Git 凭证或缓存，不覆盖已有发行目录。

由运维维护 `current` 链接。后端为 `/srv/chinavr-submission/current/dist/src/server.js`，前端为 `/srv/chinavr-submission/current/web/dist`。记录提交、Node 版本、测试及迁移版本。

验收：应用可读但不可写发行代码，构建用户无法读取生产配置或数据库数据。

## 第 11 步/14：独立 systemd 服务

创建项目专用 `/etc/systemd/system/chinavr-submission.service`，已有同名文件时先核对并备份：

```ini
[Unit]
Description=ChinaVR submission service
After=network-online.target postgresql@16-chinavr.service
Wants=network-online.target
Requires=postgresql@16-chinavr.service
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=chinavr_submission
Group=chinavr_submission
WorkingDirectory=/srv/chinavr-submission/current
EnvironmentFile=/etc/chinavr-submission.env
ExecStart=/opt/chinavr-runtime/node/bin/node /srv/chinavr-submission/current/dist/src/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
CapabilityBoundingSet=
ReadWritePaths=/var/lib/chinavr-submission /var/log/chinavr-submission
MemoryHigh=768M
MemoryMax=1G
CPUQuota=100%
TasksMax=128
StandardOutput=journal
StandardError=journal
SyslogIdentifier=chinavr-submission

[Install]
WantedBy=multi-user.target
```

资源预算需实际测试校准。stdout/stderr 在 journald 中按本服务筛选；应用日志目录留给明确配置的文件日志，创建目录不会自动实现日志写入或轮转。

```bash
sudo systemd-analyze verify /etc/systemd/system/chinavr-submission.service
sudo systemctl daemon-reload
sudo systemctl enable --now chinavr-submission.service
sudo systemctl status chinavr-submission.service --no-pager
```

每条命令通过后再继续。`daemon-reload` 读取单元定义，不是重启其他服务。

验收：实际进程属于运行用户、使用独立 Node.js，没有启动失败或重启循环。

## 第 12 步/14：内部服务验证

```bash
sudo ss -lntp
sudo systemctl show chinavr-submission.service -p User -p Group -p ActiveState -p NRestarts
sudo journalctl -u chinavr-submission.service -n 50 --no-pager
curl -i --max-time 10 http://127.0.0.1:3017/api/v1/me
```

确认应用仅监听 `127.0.0.1:3017`、数据库仅监听 `127.0.0.1:5433`，日志显示 `mode=postgres`。出现全网卡监听时停止对应本项目服务并修正。

未登录 `/api/v1/me` 预期返回 **401**，仅证明未登录路径响应，不能证明业务表、邮件或投稿正常。另行用运行角色验证数据库与业务 API。日志不得泄漏密码、密钥或令牌。当前 Cookie 带 Secure，浏览器登录验收放到 HTTPS 就绪后。

验收：监听、权限、持久化和错误处理正常，尚不公开应用。

## 第 13 步/14：子域名、代理与 HTTPS

依次执行并验证：

1. 核对根域名备案、服务内容及阿里云接入状态；备案截图不代替接入检查。
2. 读取现有 `submit` 的 A/AAAA/CNAME 和相关解析，只增加或明确调整此子域名，记录原值；保留根域名、`www` 及 MX/SPF/DKIM 等邮件记录。
3. 检查 `80/443` 和现有代理。没有 Nginx 时评估安装及默认站点行为；已有共享代理时先备份、评估并取得新增配置/重载的明确确认。不覆盖已有站点。
4. Nginx 静态根目录仅为 `/srv/chinavr-submission/current/web/dist`。根据实际 worker 身份配置定向 ACL：父目录只允许穿越，`web/dist` 允许目录读取/穿越和文件读取。不要将 Nginx 加入应用组或开放整个源码目录；每次发布重查 ACL。
5. 使用阿里云证书或 Certbot 的 `certonly --webroot` 方式，仅签发此子域名证书，记录续期责任并验证续期。签发前 HTTP 仅提供 ACME 验证/维护页，不开放注册登录或投稿。
6. HTTPS 就绪后将 HTTP 重定向到固定正式地址。内测期间在本项目站点增加经验证的访问控制，例如仅允许测试者来源 IP；手机网络变动时同步核对限制，不修改其他站点。
7. 配置前后执行 `nginx -t`，通过后才重载；同时复测已有站点。

HTTPS server 内的 API 代理参考：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3017;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header Forwarded "";
    proxy_set_header Connection "";
    proxy_cache off;
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;
    client_max_body_size 64k;
    add_header Referrer-Policy no-referrer always;
}
```

`proxy_pass` 不带 URI 部分以保留 `/api/` 路径。当前是浏览器直达 ECS Nginx，覆盖客户端转发头；应用直接使用 `X-Forwarded-For` 进行限流及写入 inet 字段，不能透传伪造值。以后加入 CDN/SLB 时重新配置可信代理。

静态资源缺失返回 404，SPA 页面按实际路由回退 index；源码、`.env`、Git 和数据库文件不能被静态服务访问。

本项目独立访问/错误日志及轮转策略必须落实。项目专用访问日志格式只记录路径 `$uri`，不记录 `$request`、`$request_uri`、`$args`、Cookie、Authorization 或 Referer，避免邮件令牌落盘。`log_format` 放在经检查的 `http` 上下文，只增加本项目命名定义；错误日志也可能带 URI，需实际用测试令牌检查并对认证路由抑制或脱敏，不能只改访问日志就宣称安全。

注册、发信和密码重置接口配置本项目专用限流，测试后启用，不改变其他站点限制。

验收：证书、DNS、路由、Cookie、日志和内测访问控制通过，已有站点正常，尚不开放公众投稿。

## 第 14 步/14：验收、持续备份与发布

用手机蜂窝网络及两套测试账户验证：

- 首页和资源、注册、邮箱验证、登录退出、密码重置完整可用，新邮件链接使用正式 HTTPS 地址。
- 草稿在刷新及重启本项目后仍存在；重复请求、并发编辑、失败重试正确。
- 用户 A 不能读写 B 的投稿；未登录、伪造 CSRF、伪造转发头及非管理员访问受限，限流有效。
- 真实平台链接可以保存，非法协议/主机名被拒绝；保存为 `pending` 不等于审核通过，不能伪造 `passed`。
- 正式提交、后台查看若属于发布范围，必须实测权限、流程和审计。仅草稿原型通过时保持受限内测，不作为正式比赛入口。
- 从外部检查应用/数据库端口不可达，检查本机文件和账号隔离、资源峰值、错误率及现有项目状态。

公众开放前落实以下运维项：

- 项目独立备份任务和最小权限备份身份，凭证由运维保护；同时备份数据库、MFA 密钥、必要配置及发行信息。
- 初始建议目标：每小时数据库备份、本机保留 24 小时，异机加密保存每日备份 30 天。结合赛事数据丢失容忍度、容量及费用确认实施；不能把同盘目录当作异机备份。
- 在本项目演练库实际恢复并验证账户、稿件、权限和 MFA 密钥，记录数据丢失窗口和恢复耗时。
- 配置并测试项目健康、资源、磁盘、错误、备份失败和证书到期告警；设置日志与备份保留上限。
- 记录发布 SHA、运行时、迁移、服务/代理文件和证书续期/撤销方式。

验收通过后移除本项目内测限制并复测其他站点，最后生成正式 HTTPS 地址二维码。测试凭证、会话和真实投稿数据不进入聊天或仓库。

## 后续升级与回滚

每次升级建立新发行目录，仅切换本项目 `current` 和重启本服务；禁止在正在运行的发行目录直接 `git pull` 或 `npm install`。

代码回退先确认数据库兼容，再指回旧发行目录；Node 版本变动时一并恢复项目 runtime 链接。数据库故障先阻止本项目写入并保全当前数据，在本项目新恢复库验证后再切换连接，复查授权，不直接覆盖正式数据。

代理回退只撤销本项目站点、证书引用及必要 DNS 变更，保留其他项目配置。共享代理重载仍须 `nginx -t` 和已有站点检查。整盘快照只用于明确评估过影响的整机恢复。

## 核对依据与文档验证边界

- 仓库：`package.json`、`src/server.ts`、`src/runtime.ts`、`src/app.ts`、`db/README.md` 与当前迁移。
- [Hono Node 适配器](https://github.com/honojs/node-server)、[PostgreSQL 16 psql](https://www.postgresql.org/docs/16/app-psql.html)、[Nginx 代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。

本次仅修订部署文档；应用监听修复、配置加载、迁移与恢复均须在对应步骤验证。服务器或代码状态变化时更新该步记录，不将方案文字当作已完成部署的证据。
