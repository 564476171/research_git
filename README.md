# Research Git

Research Git 是一个面向科研写作和论文迭代的版本管理系统。它借鉴 Git 的版本历史、分支和回溯思想，但目标不是代码，而是科研草稿、导师反馈、版本对比和写作轨迹。

当论文或研究文档反复修改后，作者经常很难判断每一版为什么改、改了什么、导师意见如何影响后续版本，以及是否又回到了早期写法。Research Git 将这些过程可视化，并提供 AI 辅助总结与项目问答。

## 核心功能

- 邮箱密码注册 / 登录。
- 自用工作区和小组工作区。
- 工作区角色：管理员、导师、学生。
- Markdown 写作编辑器，支持编辑、预览、分屏。
- 文档版本提交、编辑、删除。
- Fork 分支与类 Git Graph 的分支谱系可视化。
- 每个版本可手动触发 AI 总结：
  - 总结截至当前版本的内容。
  - 总结当前版本相对上一版本的变化。
- 项目级 AI 对话：
  - 每个用户私有上下文。
  - 支持清空上下文。
  - 支持流式输出。
  - 可在项目 AI 窗口选择个人模型或工作区共享模型。
- OpenAI-compatible 模型配置：`base_url` / `api_key` / `model` / 可选 embedding model。
- 个人主页：资料编辑、头像上传、个人模型配置。
- 全局管理员后台：
  - 用户管理。
  - 工作区管理。
  - 注册开关 / 邀请码注册 / 关闭注册。
  - 前端地址配置。
- 深色 / 浅色主题与中英文切换。

## 技术栈

- Frontend: Next.js 14, React, TypeScript, Tailwind CSS
- Backend: FastAPI, SQLAlchemy Async, Alembic
- Database: PostgreSQL 16 + pgvector
- Cache / queue foundation: Redis
- Deployment: Docker Compose

## 部署指南

### 1. 准备环境

服务器或本机需要安装：

- Git
- Docker
- Docker Compose
- Python 3

### 2. 获取项目

```bash
git clone https://github.com/564476171/research_git.git
cd research_git
```

如果你已经在项目目录中，可以跳过这一步。

### 3. 生成 `.env`

项目提供 bootstrap 脚本自动生成数据库密码、JWT 密钥、Fernet `MASTER_KEY` 和 `DATABASE_URL`。

```bash
python3 scripts/bootstrap-env.py
```

脚本会根据 `.env.example` 生成 `.env`。默认情况下，你只需要修改管理员邮箱：

```env
ADMIN_BOOTSTRAP_EMAILS=you@example.com
```

注意：

- 没有默认管理员账号和密码。
- `ADMIN_BOOTSTRAP_EMAILS` 只是管理员邮箱白名单。
- 你需要用这个邮箱在前端注册账号，注册时自己设置密码。
- 该邮箱注册或登录后会自动成为 global admin。
- `MASTER_KEY` 用于加密保存的模型 API key；一旦开始保存模型密钥，不要随意轮换它。

### 4. 启动服务

```bash
docker compose up -d --build
```

默认对外端口：

- 前端：http://localhost:6288

后端 API、PostgreSQL 和 Redis 只在 Docker 内部网络中访问：

- 前端容器通过 `/api` 和 `/media` 代理到 `api:8000`。
- 后端容器通过 `db:5432` 访问 PostgreSQL。
- 后端容器通过 `redis:6379` 访问 Redis。

因此不需要把后端、数据库或 Redis 端口暴露到公网。

### 5. 初始化全局管理员

1. 打开前端：`http://localhost:6288`
2. 使用 `.env` 中 `ADMIN_BOOTSTRAP_EMAILS` 配置的邮箱注册。
3. 注册成功后，该账号会自动拥有全局管理员权限。
4. 点击头像菜单进入管理员后台。

如果你已经用该邮箱注册过普通账号，重新登录后也会自动提升为全局管理员。

### 6. 配置模型

进入工作区后，可以在 Models 页面配置模型。

需要填写：

- Base URL：OpenAI-compatible API 地址，例如 `https://api.openai.com/v1`
- API Key：模型服务密钥
- Chat model：聊天模型名
- Embedding model：可选，用于版本相似度等功能

模型配置分为：

- 工作区共享模型：由工作区管理员配置，成员可使用。
- 个人模型：只对自己可见，可覆盖默认模型。

### 7. 管理注册方式

全局管理员可以在管理员后台设置注册策略：

- 开放注册。
- 邀请码注册。
- 关闭注册。

也可以创建、启用、停用邀请码。

### 8. 修改前端地址

管理员后台的“部署设置”中可以修改前端地址。

这个地址主要用于后端 CORS 判断和后续平台功能。初始值为：

```env
PUBLIC_FRONTEND_URL=http://localhost:6288
```

如果部署到服务器域名，例如 `https://example.com`，请在管理员后台改成对应前端域名。

## 常用命令

查看服务状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f api web
```

重启服务：

```bash
docker compose restart
```

停止服务但保留数据：

```bash
docker compose down
```

删除本地全部项目数据卷：

```bash
docker compose down -v
```

这会删除 PostgreSQL 数据、Redis 数据和上传媒体文件，无法恢复。

## 开发说明

后端迁移在 API 容器启动时自动执行：

```bash
alembic upgrade head
```

如果修改了数据库模型，需要新增 Alembic migration。

前端生产构建使用：

```bash
docker compose build web
```

后端生产构建使用：

```bash
docker compose build api
```

## 目录结构

```text
research_git/
├── backend/              # FastAPI 后端
├── frontend/             # Next.js 前端
├── scripts/              # 部署辅助脚本
├── docker-compose.yml    # Docker Compose 服务编排
├── .env.example          # 环境变量模板
└── DESIGN.md             # 产品与架构设计蓝图
```
