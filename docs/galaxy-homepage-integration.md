# 银河主页接入说明

正式站首页使用 `web/src/GalaxyHome.tsx` 和 `web/src/galaxy/` 中的只读渲染模块。银河点云、元数据和预设位于 `web/public/galaxy/`，构建后作为静态资源发布。

调参页仍保留在实验工作区 `.galaxy-poc/experiments/galaxy-pointcloud-poc/`，只绑定本机调参服务。它不属于公开站构建，不应放进 `web/`、生产路由或公开导航，也不应连接正式数据库。需要远程调参时，应另设受保护的内部环境和独立账号，完成参数验收后把静态预设更新到正式分支。

首页按钮使用正式站现有的 `#submit`、`#requirements`、`#society` 路由；登录、投稿、人员介绍和管理员页面仍由原应用路由负责。
