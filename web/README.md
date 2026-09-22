# 前端原型

`web/` 是 ChinaVR 2026 投稿系统的 React + Vite 前端原型，当前覆盖公开首页、登录入口和六步投稿编辑器的界面骨架。

## 本地运行

在项目根目录执行：

```bash
npm run web:dev
```

Vite 开发服务器会把 `/api` 请求代理到 `http://localhost:3000`。后端另开终端执行 `npm run dev` 后，登录表单才会调用本地认证接口。

## 验证

```bash
npm run web:typecheck
npm run web:build
```

当前投稿步骤仍是交接阶段的界面骨架，真实草稿、链接预检、状态机和提交接口接入前不会产生正式投稿数据。生产发布前还需要接入自托管字体、赛事配置和服务端投稿 API。
