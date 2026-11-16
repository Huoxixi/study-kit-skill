# 复习资料工坊 · study-kit

把讲义、教材、考纲、题库或个人笔记，整理为有出处的知识卡片、练习与解析；需要时再制作可交互的HTML复习网站。

这是一份给支持Skill的助手使用的工作流程，附带可选的数据检查器。它不是预先填满内容的题库，也不是自动判断所有知识真伪的程序。

当前 Skill 版本：**1.2.0**。入口：[SKILL.md](SKILL.md)。配套安卓应用：**1.1.0**。

## 安卓版与课程项目

[下载安卓安装包](https://github.com/Huoxixi/study-kit-skill/releases/download/android-v1.1.0/StudyKit-Reader-1.1.0.apk) · [版本说明与附件](https://github.com/Huoxixi/study-kit-skill/releases/tag/android-v1.1.0) · [安卓源码与构建](android-app/README.md)

安卓版可导入多份独立 HTML / HTM，按课程分类、搜索、排序、置顶和更新。每份资料单独保存学习记录，支持完整备份；无需服务器、账号或联网权限。将 APK 传到 Android 8.0 及以上手机后安装；已有 1.0.0 请覆盖安装，保留资料与进度。卡片和做题交互由导入网页自身提供。

仓库同时保存可离线打开的人工智能四级课程示例 [index.html](index.html)，含 141 张卡片、212 道题，以及 `web/`、`content/`、`assets/` 和 `tools/build_site.py`。本示例是学习参考，不是官方答案或评分细则；原始 PDF 与素材不随仓库分发。

[课程使用说明](使用说明.md) · [多课程版验收](docs/安卓APP多课程升级验收.md) · [更新记录](CHANGELOG.md)

安卓 1.1.0 已在 Android 15 模拟器完成 25 项行为检查，尚未做物理手机验证。单份 HTML 上限 20 MiB；不自动导入相邻资源目录，不提供云同步，卸载前请导出备份。

### 从源码构建

Windows x64、PowerShell 7：

```powershell
./android-app/tools/bootstrap.ps1
./android-app/tools/build-local.ps1
```

工具脚本使用固定版本和校验值，首次需联网下载官方 Java / Android 工具。签名私钥留在维护者本地；自行构建会生成自己的签名，不能覆盖官方发布包。独立网页可直接打开，无需构建；修改课程后可用 Python 3 运行 `python tools/build_site.py`。

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
android-app/                    安卓阅读器源码、构建与测试辅助脚本
index.html                      可离线导入的课程示例
web/、content/、assets/          示例的页面、数据和字体许可
docs/外部资料采用记录.md          Skill、示例与安卓应用的采用依据
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

仓库包含明确标注来源的课程示例与学习参考；不包含原始课程附件、学生资料、真实学习记录、签名私钥、浏览器信息或服务器配置。字体子集沿用 SIL OFL，见 `assets/fonts/OFL.txt`；课程中引用的 PyTorch 示例代码附原 BSD 许可，见 `docs/sources/PyTorch-tutorials-LICENSE.txt`。其他引用与验证边界见 [外部资料采用记录](docs/外部资料采用记录.md)。

## 通用Skill 1.2.0

新增章节教学主线、重要联系回看、位置线路与独立网状图约定；增加按需手机资料库、导入隔离、进度保留及安卓/苹果验收边界。安卓应用仍为1.1.0，未重新编译。精简通用Skill仓库：[study-review-workshop](https://github.com/Huoxixi/study-review-workshop)。
