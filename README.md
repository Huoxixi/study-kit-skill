# 复习资料工坊 · study-kit

把讲义、教材、考纲、题库或个人笔记，整理为有出处的知识卡片、练习与解析；需要时再制作可交互的HTML复习网站。

这是一份给支持Skill的助手使用的工作流程，附带可选的数据检查器。它不是预先填满内容的题库，也不是自动判断所有知识真伪的程序。

当前版本：**1.1.0**。入口：[SKILL.md](SKILL.md)。

## 能做什么

- 梳理资料版本和学习范围，把原条目、卡片、题目与来源对应起来。
- 保持概念准确，用日常例子帮助理解，并检查例子有没有改变原概念。
- 编写适合学科的题目和解析；区分原题、自编题、学习参考与官方评分，保留歧义。
- 复核范围遗漏、条目内部缺失和只有介绍却没有练习的情况。
- 按需制作离线HTML：切卡不跳页，操作容易找到，长内容可内部翻页，收藏和备份真实可用。
- 用户要求上线时，再处理手机网址、独立路径、原站保护及线上验证。

默认以卡片与题目组织，不按天排计划；目标、交付形式、设计与当前用户的明确要求均可覆盖默认值。只需卡片时，不擅自扩成网站。

## 安装与调用

在Codex中，可以把仓库地址交给技能安装器：

```text
请使用 $skill-installer 安装 https://github.com/Huoxixi/study-kit-skill 这个仓库中的 study-kit Skill。
```

手动安装时，把本仓库放进客户端实际支持的技能目录，文件夹命名为`study-kit`，让`SKILL.md`直接位于该文件夹下。当前Codex文档列出的用户级目录为`~/.agents/skills/`；已有环境若使用其他可发现目录，请沿用其实际配置，避免同名技能重复安装。参见[官方说明](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。

安装后可直接说：

```text
用 $study-kit，根据当前文件夹的课程资料，整理知识卡片、练习和解析。
```

也可以限定任务：

```text
用 $study-kit，全面复核现有复习资料的概念、例子和题目解析，只修改内容，不重新设计网站。
```

## 文件结构

```text
SKILL.md                         工作入口与适用范围
agents/openai.yaml               名称与默认调用提示
references/content-quality.md    概念、例子、题解与复核
references/interactive-site.md   网站交互、验收与按需发布
references/data-contract.md      可选的数据格式
references/evolution.md          更新方式与版本记录
scripts/check_study_data.py      结构、关联和覆盖检查器
examples/minimal-course.json     人工构造的格式示例
tests/test_study_data.py         可复现检查
docs/外部资料采用记录.md          本Skill采用的结构规范
```

## 可选的数据检查

检查器只使用Python标准库。新项目可以采用示例格式；已有正常数据结构不必为了它迁移。

```bash
python scripts/check_study_data.py examples/minimal-course.json --mode full --report tmp/check.json
python -m unittest discover -s tests -v
```

仅交卡片时可用`--mode cards`。报告列出结构错误、来源引用、关联和目标覆盖。示例的课堂笔记路径是虚拟的格式示意，不是随仓库提供的教材。

测试涵盖完整数据、缺练习、未知来源、重复编号、答案不在选项内、歧义题误设自动判分、主观题缺自查项及报告不能覆盖输入文件等情况。本次在Python3.12验证。

结构通过不能证明概念、例子或推理正确；每门课仍需实际内容复核。网站和学习效果也需要分别验证。

## 后续完善

使用中发现可复用的问题，可以继续修订同一份Skill。按[维护约定](references/evolution.md)区分通用方法、可配置偏好与单门课事实，更新版本并运行相关测试。

仓库不包含原课程题库、学生资料、真实学习记录、浏览器信息或服务器配置。
