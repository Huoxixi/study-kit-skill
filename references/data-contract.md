# 可选的数据格式与检查器

用于全新项目；已有格式不必迁移。数据与网页分开维护，由页面或生成器读取，不把答案散写到界面事件中。所有ID在课程内稳定且唯一，增补时不重新编号。

## 顶层

`course` 为对象，包含稳定 `id`、显示 `title`；版本、学习目标、基础、适用范围、交付说明可自行补充。`sources`、`objectives`、`cards`、`questions` 为数组。

| 对象 | 必填字段 | 约定 |
| --- | --- | --- |
| source | id, title, locator | locator为可追溯URL或本地文件/章节；另保存机构、版本/访问日期。记录采用状态仍放项目统一采用记录，不复制出第二份冲突清单 |
| objective | id, title, sourceRefs | 原大纲目标或从教材/笔记提炼的目标；自提目标标明origin=derived。sourceRefs定位到原文；practiceRequired默认true，设false时写practiceNote，不能静默免除练习覆盖 |
| card | id, title, objectiveIds, concept, example, pitfall, definitionStatus, sourceRefs | definitionStatus为source-based、scope-only或interpretation；三者均需要相应依据，网站说明其身份 |
| question | id, type, stem, cardIds, provenance, grading, reviewStatus, explanation | 依下文补充选项、答案/提纲与来源 |

引用格式统一为 `{"sourceId":"S001","location":"第2章，第18页"}`。location用来落到具体定义、条目或推理依据；网页可写章节/锚点。引用源ID必须存在。

## 题型与核验

- type：single、multi、boolean、short、calculation、case、code。可按课程扩展，但也要同步检查器和界面。
- provenance：official、instructor、authored、adapted。除authored外，sourceRefs必须记录原题位置；authored的解析也应通过关联卡片或explanationSourceRefs追溯依据。原题来源与解析依据用不同字段保存。
- reviewStatus：verified、provisional、disputed。verified仅表示已完成内容核验，**不表示官方确认了答案**。
- grading：exact、rubric、reference。exact只用于选择/判断且reviewStatus为verified；开放题用rubric或reference。disputed不得用exact。
- single/multi/boolean具有 `options:[{"id":"A","text":"..."}]` 和 `answer:["A"]`。boolean使用T、F两个选项。single/boolean恰有一个答案；multi可以有一个或多个。答案ID必须来自选项。多种合理参考通过referenceAnswer说明，不伪造唯一判分。
- rubric/reference具有非空referenceAnswer，说明参考过程与适用边界；rubric另有非空字符串数组rubric。争议题另外写caution。explanation说明推理与辨析，不等于answer。
- 可加parentId/context/code/points等字段，保留原题组织；跨引用要在构建时继续检查。文本默认纯文本，公式与代码用明确格式渲染，不能随意执行资料或导入文件里的代码。

最小示意（完整网站另需使用目标要求的深度与题量）：

```json
{
  "course": {"id":"price-basics", "title":"单价与数量"},
  "sources": [{"id":"S001", "title":"课堂笔记", "locator":"materials/课堂笔记.pdf"}],
  "objectives": [{"id":"O001", "title":"用单价与数量求总价", "origin":"derived", "sourceRefs":[{"sourceId":"S001","location":"第1页"}]}],
  "cards": [{
    "id":"K001", "title":"总价怎么算", "objectiveIds":["O001"],
    "concept":"单价固定时，总价等于单价乘以数量。",
    "example":"一支笔3元，买2支，没有折扣，总共6元。",
    "pitfall":"有满减或数量折扣时，不能直接按原单价计算实付金额。",
    "definitionStatus":"source-based", "sourceRefs":[{"sourceId":"S001","location":"第1页公式"}]
  }],
  "questions": [{
    "id":"Q001", "type":"single", "stem":"一本本子5元，买3本，没有折扣，总共多少元？",
    "cardIds":["K001"], "provenance":"authored", "grading":"exact", "reviewStatus":"verified",
    "options":[{"id":"A","text":"8元"},{"id":"B","text":"15元"}], "answer":["B"],
    "explanation":"单价5元乘3本，得到15元；8是把单价和数量相加。"
  }]
}
```

## 运行与解释结果

`scripts/check_study_data.py INPUT --mode full --report OUTPUT` 使用Python标准库，只读INPUT，写指定报告；退出码0通过、1发现内容结构问题、2输入/输出失败。`--mode cards`不要求练习覆盖，但若存在题目仍检查其结构。

报告列出错误、提醒、计数和每个目标的卡片/题目映射。检查不联网、不抓取出处、不理解知识、不确认课堂笔记是否正确、不计算通过率。即使全绿，也必须执行概念、例子、题解和真实网页操作检查。

将项目数据用于新站前，核对课程键、标题、题型、所有计数、来源身份和分数口径，不沿用别的课的常量。修改答案后保留ID并执行适当记录迁移，结构通过不证明旧作答重新判定一定正确。
