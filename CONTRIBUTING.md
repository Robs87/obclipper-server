# 贡献指南

感谢你对 ObClipper Server 的关注！欢迎参与贡献。

## 报告 Bug

如果你发现了 Bug，请通过 [GitHub Issues](../../issues) 提交，并包含以下信息：

- **Bug 描述**：清晰描述问题
- **复现步骤**：如何触发该 Bug
- **期望行为**：你期望的正确行为
- **实际行为**：实际发生了什么
- **环境信息**：Node.js 版本、操作系统、Docker 版本等
- **日志输出**：相关的错误日志（请移除敏感信息）

## 功能请求

欢迎通过 [GitHub Issues](../../issues/new?template=feature-request.yml) 提交功能请求，请说明：

- 你希望实现的功能
- 为什么需要这个功能（使用场景）
- 如果有的话，提供实现思路

## 提交 PR

1. **Fork** 本仓库到你的账号
2. 基于 `main` 创建功能分支：`git checkout -b feat/your-feature`
3. 进行开发和测试
4. 确保代码风格与项目一致
5. 提交代码：`git commit -m "feat: 简短描述"`
6. 推送分支：`git push origin feat/your-feature`
7. 创建 **Pull Request**，填写 PR 模板中的各项内容

## 代码风格

- 使用 JavaScript (Node.js 20+)
- 缩进：2 个空格
- 使用单引号
- 语句末尾加分号
- 异步操作使用 async/await

## Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>
```

**类型（type）：**

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具变更 |

**示例：**

```
feat(scraper): 添加超时重试机制
fix(uploader): 修复 R2 路径拼接错误
docs: 更新 API 文档
```
