# Research Git — 设计文档

## 1. 背景与动机

科研写作中常见痛点：

> 学生在导师指导下不断修改论文/报告，迭代多轮后发现最终稿与初版高度相似，过程中的大量精力消耗在了被回退或循环的修改上。学生缺乏数据反驳"无效迭代"，导师也难自查。

普通 git 关注的是「代码行级差异」，对科研写作场景几乎不产生洞察。Research Git 不是 git for documents，而是：

> **AI 驱动的科研写作迭代分析平台** — 基于版本相似度、语义级 diff 与轨迹可视化，让学生与导师都能"看见"迭代是真前进还是绕圈。

## 2. 产品定位

- **形态**：自托管 Web 应用，docker compose 一键部署
- **使用方式**：用户在浏览器内编辑器写作，每次提交触发后台 LLM/embedding 分析
- **两种模式**:
  - **自用模式 (Personal)**：单用户，自己写、自己看分析
  - **小组模式 (Team)**：多角色协作（管理员 / 导师 / 学生）
- **模型来源**：使用方可选「管理员配置的共享模型」或「自己接入的模型」（OpenAI 兼容端点 + key）

## 3. 核心价值

| 能力 | 说明 |
|---|---|
| **版本相似度检测** | "你的 v7 与 v2 相似度 92%" — 用 embedding 余弦相似度算 |
| **语义级 diff** | 段落对齐 + LLM 描述变化，而不是 line-level diff |
| **迭代轨迹可视化** | 把所有版本 embedding 降维到 2D，画出"漂移地图" + commit DAG，标出循环修改 |
| **AI 智能摘要** | 每次 commit 自动生成"这次到底改了什么 / 是实质改进还是回退"的总结 |

## 4. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Next.js (App Router) + TypeScript + TailwindCSS | Web 可视化首选；diff/trajectory 用 D3 + react-flow |
| 后端 | FastAPI (Python 3.11+) | LLM 生态最成熟；async 适合流式 LLM 响应 |
| 数据库 | PostgreSQL 16 + pgvector | 关系数据 + 向量相似度查询一站搞定 |
| 缓存 | Redis 7 | 缓存 LLM 输出、限流、后台任务队列 |
| 后台任务 | RQ (Redis Queue) 或 Celery | embedding 计算、LLM 摘要异步化 |
| 认证 | 自建 Email + 密码（bcrypt + JWT） | 无外部依赖，自托管首选 |
| LLM/Embedding | 通过用户/管理员配置的 OpenAI 兼容端点 | 统一协议，最大兼容性 |
| 部署 | Docker Compose | 4 服务：`web` `api` `db` `redis` |

## 5. 系统架构

```
┌──────────────────────────┐         ┌──────────────────────────┐
│   Web (Next.js)          │ ──HTTP─▶│   API (FastAPI)          │
│   - 编辑器                │         │   - Auth / RBAC          │
│   - Diff 视图             │         │   - Commits CRUD         │
│   - 轨迹图                │         │   - Similarity (pgvector)│
│   - 摘要面板              │         │   - Semantic diff        │
│   - Workspace 切换        │         │   - LLMRouter            │
│   - 模型配置 UI           │         │   - Background dispatch  │
└──────────────────────────┘         └──────────┬───────────────┘
                                                │
                  ┌─────────────────────────────┼─────────────────────────┐
                  ▼                             ▼                         ▼
        ┌──────────────────┐         ┌──────────────────┐       ┌──────────────────┐
        │  Postgres 16     │         │   Redis 7        │       │  Worker (RQ)     │
        │  + pgvector      │         │   - cache        │       │  - embedding     │
        │                  │         │   - queue        │       │  - llm_summary   │
        └──────────────────┘         └──────────────────┘       └────────┬─────────┘
                                                                          │
                                                                          ▼
                                                                  ┌──────────────┐
                                                                  │ External LLM │
                                                                  │ (用户/管理员  │
                                                                  │  配置端点)   │
                                                                  └──────────────┘
```

## 6. 数据模型

### 6.1 ER 概览

```
User ─┐
      ├─< Membership >─ Workspace ─< Project ─< Branch ─< Commit
      │                    │           │                    │
      │                    │           │                    ├─< Embedding
      │                    │           │                    └─< LLMSummary
      │                    │           │
      │                    └─< ModelConfig (workspace 共享)
      │
      └─< ModelConfig (user 私有, scope=user)
      └─< UserModelPref (per-workspace 当前激活)
      └─< Review (作为 reviewer 提交)
```

### 6.2 表结构（核心字段）

```sql
-- 用户
users
  id PK
  email UNIQUE NOT NULL
  password_hash NOT NULL          -- bcrypt
  display_name
  created_at

-- 工作空间
workspaces
  id PK
  name
  mode ENUM('personal','team')
  owner_id FK→users.id
  created_at

-- 成员关系
memberships
  id PK
  user_id FK
  workspace_id FK
  role ENUM('self','admin','advisor','student')
  advisor_of JSONB              -- student_id[]，仅 advisor 角色用
  created_at
  UNIQUE(user_id, workspace_id)

-- 模型配置（workspace 共享 或 user 私有）
model_configs
  id PK
  workspace_id FK
  owner_id FK→users.id NULL     -- NULL=workspace 共享；非 NULL=user 私有
  scope ENUM('workspace','user')
  name                          -- 用户自定义标签 e.g. "组里的 Sonnet"
  base_url                      -- e.g. https://api.anthropic.com/v1
  model_name                    -- e.g. claude-sonnet-4-6
  api_key_enc                   -- AES-GCM ciphertext
  is_default BOOL               -- workspace scope 仅一个 default
  created_at

-- 用户在某 workspace 的当前激活模型
user_model_prefs
  user_id FK
  workspace_id FK
  active_model_config_id FK→model_configs.id
  PRIMARY KEY(user_id, workspace_id)

-- 项目
projects
  id PK
  workspace_id FK
  owner_id FK→users.id
  title
  description
  created_at

-- 分支（v1 默认每项目一个 main 分支）
branches
  id PK
  project_id FK
  name
  head_commit_id FK→commits.id
  UNIQUE(project_id, name)

-- 提交（核心）
commits
  id PK
  project_id FK
  branch_id FK
  parent_id FK→commits.id NULL
  author_id FK→users.id
  message TEXT                   -- 用户写的 commit message
  content TEXT                   -- 完整文档内容（v1 全量存储，后续可改 delta）
  embedding VECTOR(1024) NULL    -- 异步填充
  llm_summary TEXT NULL          -- 异步填充
  status ENUM('pending','ready') -- ready 表示 embedding+summary 都就绪
  created_at
  INDEX ON embedding USING ivfflat (vector_cosine_ops)

-- 段落级 embedding（用于语义 diff）
commit_paragraphs
  id PK
  commit_id FK
  ord INT                        -- 段落序号
  text TEXT
  embedding VECTOR(1024)
  INDEX(commit_id, ord)

-- 导师反馈
reviews
  id PK
  commit_id FK
  reviewer_id FK→users.id
  content TEXT
  anchor_paragraph_ord INT NULL  -- 锚定到具体段落，可空表示整体
  status ENUM('open','resolved')
  created_at
  resolved_at
```

### 6.3 核心索引

- `commits.embedding` — pgvector ivfflat (cosine)
- `commit_paragraphs.embedding` — pgvector ivfflat (cosine)
- `(workspace_id, owner_id)` on memberships
- `(project_id, created_at DESC)` on commits

## 7. 用户与权限模型

### 7.1 角色矩阵

| 操作 | self | admin | advisor | student |
|---|:-:|:-:|:-:|:-:|
| 创建/编辑自己 project | ✅ | ✅ | ✅ | ✅ |
| 看其他成员 project | n/a | ✅ | ✅(限 advisor_of) | ❌ |
| 写 review | n/a | ✅ | ✅(限 advisor_of) | ❌ |
| 邀请/移除成员 | n/a | ✅ | ❌ | ❌ |
| 配置 workspace 模型 | n/a | ✅ | ❌ | ❌ |
| 配置个人模型 | ✅ | ✅ | ✅ | ✅ |
| 切换激活模型 | ✅ | ✅ | ✅ | ✅ |

### 7.2 自用模式

新注册用户自动创建一个 `mode=personal` 的私有 workspace，role=`self`。该 workspace 只能 1 名成员。

### 7.3 小组模式

- admin 创建 `mode=team` workspace
- 通过 email 邀请成员，分配 advisor / student 角色
- advisor 角色被赋予 `advisor_of=[student_id...]` 显式绑定关系
- 一个学生可有多导师；一个导师可带多学生

### 7.4 鉴权实现

- 注册：`email + password` → bcrypt 哈希
- 登录：返回 JWT（access 30min + refresh 7d）
- API 中间件：`require_workspace_role(*roles)` 装饰器统一检查
- 项目级：`require_project_access(...)`（owner / advisor 绑定 / admin）

## 8. 模型路由层 (LLMRouter)

### 8.1 路由解析

每次需要调 LLM 时：

```python
def resolve(user, workspace) -> ModelConfig:
    # 1. 优先用户在该 workspace 的私有偏好
    pref = UserModelPref.get(user, workspace)
    if pref and pref.active_config.scope == 'user' and pref.active_config.owner_id == user.id:
        return pref.active_config

    # 2. 用户偏好指向 workspace 共享 → 用之
    if pref and pref.active_config.scope == 'workspace':
        return pref.active_config

    # 3. fallback：workspace 默认共享模型
    default = ModelConfig.find(workspace_id=workspace.id, scope='workspace', is_default=True)
    if default: return default

    raise NoModelConfigured("请先配置模型")
```

### 8.2 协议

第一版统一走 **OpenAI 兼容协议**（`/v1/chat/completions` + `/v1/embeddings`）。

ModelConfig 字段：
- `base_url` — e.g. `https://api.anthropic.com/v1`、`https://api.openai.com/v1`
- `model_name` — e.g. `claude-sonnet-4-6`、`gpt-4o`
- `api_key_enc` — 加密的 key

> 注：Anthropic 提供 OpenAI 兼容端点（部分能力差异）。若后续需要原生 Anthropic 协议或本地 Ollama，可加 `protocol` 字段扩展，不影响 v1 数据模型。

### 8.3 调用接口

```python
class LLMClient:
    def chat(messages: list, *, stream=False) -> str | AsyncIterator[str]
    def embed(texts: list[str]) -> list[Vector]
```

所有上层（语义 diff、commit 摘要等）只依赖此抽象接口，不知道用户用的是谁的 key。

## 9. 核心算法

### 9.1 commit 入库流水线

```
用户 POST /commits (content)
   │
   ├─▶ 同步：写入 commits (status=pending)
   ├─▶ 同步：返回 commit_id 给前端
   │
   └─▶ 异步队列：
         ├─ 切段 → commit_paragraphs[]
         ├─ embed 文档整体 → commits.embedding
         ├─ embed 各段 → commit_paragraphs[].embedding
         ├─ LLMRouter.chat → llm_summary（"这次相比上一版改了什么"）
         └─ commits.status = 'ready'
```

### 9.2 版本相似度

整体相似度：

```sql
SELECT id, message,
       1 - (embedding <=> $1) AS similarity
FROM commits
WHERE project_id = $2 AND id != $3
ORDER BY embedding <=> $1 ASC
LIMIT 5;
```

返回当前 commit 与历史所有 commit 的相似度 top-5。前端高亮如 "v7 ↔ v2 相似度 92%"。

### 9.3 语义 diff（段落对齐）

```
1. 取 commit A 的段落 [a1..an] 与 commit B 的段落 [b1..bm]
2. 计算 n×m 余弦相似度矩阵
3. 用 Hungarian 算法做最大权匹配（阈值 0.85 视为"同源"）
4. 输出对齐结果：
   - matched: (ai ↔ bj, sim=0.92, 内容差异)
   - removed: ai ∈ A 无匹配
   - added:   bj ∈ B 无匹配
   - moved:   匹配但顺序变化
5. 对每对 matched 且 sim<0.99 的段落，调 LLM 生成"一句话变化描述"
```

### 9.4 轨迹可视化

- **降维图**：项目内全部 commit embedding 跑 UMAP → 2D 散点 + commit 时间序连线 → 看出"漂移路径"
- **commit DAG**：父子关系 + 同源（相似度高于阈值）的边；用 react-flow 渲染
- **循环检测**：在 DAG 上找形如 v3→v5→...→v9 且 sim(v3,v9)>0.95 的环路 → UI 高亮警告

### 9.5 AI 智能摘要

每次 commit 后台调用：

```
Prompt:
  上一版段落 [...]
  新版段落 [...]
  请用一句话总结主要变化（聚焦内容/论点/结构层面，忽略错别字）
```

更长的 series-level 摘要（如"本周 5 次提交中实质突破在第 3 次"）作为 P3 后置功能。

## 10. API 设计（节选）

```
# Auth
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh

# Workspace
GET    /api/workspaces                   # 我加入的所有 workspace
POST   /api/workspaces                   # 创建（personal/team）
GET    /api/workspaces/{id}/members
POST   /api/workspaces/{id}/invite       # admin only
PATCH  /api/workspaces/{id}/members/{uid} # 改角色 / 设 advisor_of

# Model Config
GET    /api/workspaces/{id}/models       # 列出 workspace 共享 + 我的私有
POST   /api/workspaces/{id}/models       # admin 加共享 / 用户加私有
PATCH  /api/workspaces/{id}/models/{mid}
DELETE /api/workspaces/{id}/models/{mid}
PUT    /api/workspaces/{id}/models/active # 切换我激活的

# Project
GET    /api/workspaces/{id}/projects
POST   /api/workspaces/{id}/projects
GET    /api/projects/{id}
GET    /api/projects/{id}/commits
POST   /api/projects/{id}/commits        # body: { content, message }

# Commit
GET    /api/commits/{id}
GET    /api/commits/{id}/similar         # top-N 相似版本
GET    /api/commits/{id}/diff?against={other_id}  # 语义 diff
GET    /api/projects/{id}/trajectory     # UMAP 坐标 + DAG 边

# Review
POST   /api/commits/{id}/reviews         # advisor only
PATCH  /api/reviews/{id}                 # 改状态
```

## 11. 前端页面

```
/login                            邮箱密码登录
/register                         注册
/                                 主页 → workspace 选择器
/w/[wid]                          某 workspace 概览
/w/[wid]/projects                 项目列表
/w/[wid]/projects/[pid]           编辑器 + commit 历史 + 摘要面板
/w/[wid]/projects/[pid]/diff      两版对比（语义 diff）
/w/[wid]/projects/[pid]/trajectory 轨迹图
/w/[wid]/members                  成员管理（admin）
/w/[wid]/models                   模型配置（admin 看共享，所有人看自己）
/me                               个人设置
```

关键交互组件：
- `<Editor />` — Markdown / 纯文本编辑器（Monaco 或 CodeMirror）
- `<CommitTimeline />` — 左侧版本时间线，hover 显示 LLM 摘要
- `<SemanticDiff />` — 段落对齐双栏视图，颜色标 added/removed/moved/modified
- `<TrajectoryMap />` — UMAP 散点 + 时间线连线（D3）
- `<CommitDAG />` — react-flow 渲染父子+相似边
- `<ModelPicker />` — 顶部下拉选当前激活模型

## 12. 安全设计

| 风险 | 措施 |
|---|---|
| API key 泄露 | AES-GCM 加密存 DB；主密钥 `MASTER_KEY` 仅在 .env；DB 备份不含明文 |
| 密码暴力破解 | bcrypt cost=12；登录限流（IP+account） |
| 越权访问 | 中间件统一 `require_workspace_role` + `require_project_access` |
| LLM 注入 | 用户内容作为 user message，不与 system prompt 拼接；LLM 输出仅作展示，不执行 |
| 共享 key 滥用 | workspace 共享模型可设月度调用次数 quota（per-user） |
| XSS | 后端返回纯文本/markdown，前端 DOMPurify |
| CSRF | JWT in Authorization header + SameSite cookies for refresh |

## 13. 部署架构

### 13.1 docker-compose 服务

```yaml
services:
  db:        postgres:16 + pgvector extension
  redis:     redis:7
  api:       本仓库 backend/Dockerfile (FastAPI + uvicorn)
  worker:    本仓库 backend/Dockerfile (RQ worker)
  web:       本仓库 frontend/Dockerfile (Next.js)
```

### 13.2 关键环境变量

```
POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
REDIS_URL
DATABASE_URL
JWT_SECRET                  # 自动生成
MASTER_KEY                  # 自动生成，用于加密 ModelConfig.api_key，保存模型密钥后不要轮换
ADMIN_BOOTSTRAP_EMAILS      # 唯一需要手动设置的初始化管理员邮箱
PUBLIC_FRONTEND_URL         # 初始前端地址，之后可在管理员后台修改
```

### 13.3 一键部署目标

```
git clone <repo>
python3 scripts/bootstrap-env.py
# 编辑 .env，只修改 ADMIN_BOOTSTRAP_EMAILS=you@example.com
docker compose up -d --build
# 浏览器打开 http://localhost:6288
```

前端通过同源 `/api` 与 `/media` 访问后端，Docker 内部代理到 `api:8000`，无需手动配置公开后端地址。

## 14. 仓库目录结构（建议）

```
research_git/
├─ docker-compose.yml
├─ .env.example
├─ DESIGN.md                 ← 本文件
├─ README.md
│
├─ backend/
│  ├─ Dockerfile
│  ├─ pyproject.toml
│  ├─ alembic/               ← DB migrations
│  └─ app/
│     ├─ main.py
│     ├─ config.py
│     ├─ deps.py
│     ├─ auth/               ← jwt, password, middleware
│     ├─ models/             ← SQLAlchemy ORM
│     ├─ schemas/            ← Pydantic
│     ├─ routers/            ← FastAPI 路由
│     ├─ services/
│     │  ├─ llm_router.py
│     │  ├─ llm_client.py
│     │  ├─ embedding.py
│     │  ├─ semantic_diff.py
│     │  └─ similarity.py
│     ├─ workers/            ← RQ tasks
│     └─ crypto.py           ← Fernet/AES key 加解密
│
└─ frontend/
   ├─ Dockerfile
   ├─ package.json
   ├─ next.config.js
   ├─ app/                    ← Next.js App Router
   ├─ components/
   ├─ lib/
   │  └─ api.ts               ← fetch wrapper, auth
   └─ styles/
```

## 15. MVP 路线图

| 阶段 | 目标交付 | 估时 |
|---|---|---|
| **P0 骨架** | docker-compose 可起；Email 注册登录；自用模式 workspace 自动创建；空项目 CRUD | 1 周 |
| **P1 写作核心** | 编辑器 + commit；ModelConfig CRUD + LLMRouter；后台 embedding；版本相似度 top-N；LLM 摘要 | 2-3 周 |
| **P2 协作** | 小组模式；admin/advisor/student 角色；邀请流；Review；advisor_of 绑定 | 2 周 |
| **P3 可视化** | 段落对齐语义 diff；UMAP 轨迹图；commit DAG；循环修改检测 | 2 周 |

P0 完成后即可对外演示自用场景；P2 完成后可开始小组试点；P3 是核心差异化能力的最终落地。

## 16. 后续延展（v2+ 不在 MVP）

- 分支与合并（当前一项目一 main 分支已够用）
- 多协议模型（Anthropic 原生 / Ollama 本地）
- 协作编辑（CRDT，类似 HackMD）
- LaTeX 编译预览
- PDF / Word 导入导出
- 项目级周报「本周迭代质量分析」
- 移动端

## 17. 未决项

- [ ] 编辑器选择：Monaco vs CodeMirror（建议 CodeMirror，体积小、对长文本友好）
- [ ] Embedding 维度：1024 暂定；实际取决于用户配置的 embedding 模型
- [ ] 段落切分策略：双换行 vs 句号 vs LLM 切分（v1 用双换行，简单可控）
- [ ] 是否给 workspace 共享 key 设置 per-user 月度配额（建议 P2 引入）
