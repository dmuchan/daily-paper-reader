# Daily Paper Reader（Fork 即用）

这是一个基于 **GitHub Actions** 每天自动更新的 arXiv 论文推荐站，输出到 **GitHub Pages（/docs）**。

你会得到：
- **零服务器**：Fork 后即可跑，每天自动产出推荐页
- **自动推荐**：抓取 arXiv → 召回 → 重排 → LLM 评分 → 生成站点
- **站内管理（可选）**：在网页里改订阅、触发工作流（需要 GitHub Token）
- **隐私优先**：私人研讨区聊天记录默认仅保存在本机（IndexedDB）

---

## 5 分钟上线（推荐路径）

### Step 1：Fork 本仓库
- 入口：仓库页面右上角 `Fork` → 选择你的账号 → `Create fork`

### Step 2：启用 Actions
- 入口：Fork 后仓库顶部 `Actions`
- 如果看到提示：点击 `I understand my workflows, go ahead and enable them` / `Enable workflows`

### Step 3：配置必需 Secret（BLT）
> 没有它也能生成基础页面，但 **重排/评分/精读总结** 会不可用或效果很差；建议先配好。

- 入口：`Settings → Secrets and variables → Actions → New repository secret`
- 添加：
  - Name：`BLT_API_KEY`
  - Secret：你的 BLT Key

### Step 4：手动跑一次工作流（生成首批内容）
- 入口：`Actions → daily-paper-reader → Run workflow → Run workflow`
- 预期结果：
  - 自动生成/更新 `docs/`（站点内容）
  - 自动生成/更新 `archive/<YYYYMMDD>/recommend/`（当日推荐存档）
  - 工作流会自动 `commit` 并 `push` 到 `main`
- 耗时：首次通常 **3–8 分钟**（取决于下载向量模型与当日论文量）

### Step 5：开启 GitHub Pages（指向 /docs）
- 入口：`Settings → Pages`
- 配置（按 GitHub UI 实际字段名为准）：
  - `Source`：选择 `Deploy from a branch`
  - `Branch`：选择 `main`
  - `Folder/Directory`：选择 `/docs`
  - `Save`

### Step 6：打开站点确认
- 入口：`Settings → Pages` 顶部会出现站点地址
- 常见地址：`https://<你的用户名>.github.io/<仓库名>/`

---

## 最少必需配置

### 1) `BLT_API_KEY` 放哪里？
- GitHub 路径：`Settings → Secrets and variables → Actions`
- 名称必须是：`BLT_API_KEY`

### 2) 自动更新时间
- 默认定时：`.github/workflows/daily-paper-reader.yml` 中 `cron: "30 2 * * *"`
- 含义：每天 **UTC 02:30**（约等于 **北京时间 10:30**；其它时区请自行换算）

---

## 可选：站内后台能力（需要 GitHub Token）

什么时候需要：
- 在网页里“保存订阅配置到仓库”
- 在网页里“一键触发工作流（立即更新/同步上游）”
- 生成 Gist 分享链接

Token 要求（Classic PAT）：
- 权限：`repo`、`workflow`、`gist`
- 配置入口：打开你的站点 → 左下角 `📚 后台管理` → `密钥配置` → 填入 `GitHub Token`

---

## 修改订阅（2 选 1）

### 方式 A（推荐）：直接编辑 `config.yaml`
- 文件：`config.yaml`
- 修改字段：`subscriptions.keywords` / `subscriptions.llm_queries` / `subscriptions.tracked_papers`
- 提交到 `main` 后，下一次 Actions 运行会生效（也可手动触发工作流）

### 方式 B：在站内后台管理修改并保存
- 需要：GitHub Token（见上面）
- 入口：站点 → `📚 后台管理` → 修改关键词/智能订阅 → `保存`

---

## 常见问题（快速排错）

1) **站点能打开但没内容**
- 去看：`Actions → daily-paper-reader` 是否运行成功；首次必须至少成功跑一次才能生成 `docs/`

2) **Pages 404**
- 检查：`Settings → Pages` 是否选择了 `main` + `/docs`

3) **Actions 失败（依赖/模型下载慢）**
- 先重试一次 `Run workflow`；如果长期失败，再查看失败日志中是否是网络或额度问题

4) **今天没有更新**
- 可能当天时间窗内无新论文，或全部被筛掉；以 `Actions` 运行日志为准

5) **Secrets 配了但似乎没生效**
- 确认 Secret 名称完全一致：`BLT_API_KEY`
- 确认 Secret 配置在你的 Fork 仓库（不是上游仓库）

---

## 安全与隐私提示（请务必读）
- 私人研讨区聊天记录默认仅保存在本机（IndexedDB），不会自动上传到 GitHub。
- `secret.private` 是加密备份文件，但它会随站点一起发布为公开静态文件：请使用强密码；不需要后台能力时可直接游客模式阅读。

---

## 更多资料（可选）
- 开发/脚本说明：`CLAUDE.md`
- 工作流配置：`.github/workflows/daily-paper-reader.yml`
- 订阅配置示例：`config.yaml`
