const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../qa/multicourse-fixtures');
const script=`<script>let count=Number(localStorage.getItem('shared-progress')||0);document.getElementById('count').textContent=count;document.getElementById('done').onclick=()=>{localStorage.setItem('shared-progress',String(++count));document.getElementById('count').textContent=count;};document.getElementById('answer').onclick=()=>{document.getElementById('answer-text').hidden=false;};</script>`;
const contents=(heading,layout='main')=>`<${layout}><h1 id="lesson">${heading}</h1><p>管理与兼容性验收示例，不是完整课程讲义。</p><details open><summary>概念卡片</summary><p>本页面的学习记录与其他 HTML 分开。</p></details><button id="answer">查看答案</button><p id="answer-text" hidden>示例答案</p><button id="done">标记一次</button><p>记录次数：<b id="count">0</b></p></${layout}>${script}`;
const full=(title,heading,charset='UTF-8',layout='main')=>`<!doctype html><html lang="zh"><head><meta charset="${charset}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:sans-serif;padding:22px;line-height:1.8;color:#17191d;background:#f5f6f8}h1{font-size:28px}button{padding:12px 20px;min-height:48px;color:white;background:#294cff;border:0;border-radius:8px;margin:8px 12px 8px 0}details{padding:16px;background:white}</style></head><body>${contents(heading,layout)}</body></html>`;
(async()=>{
  await fs.mkdir(path.join(root,'Batch'),{recursive:true});await fs.mkdir(path.join(root,'Mixed'),{recursive:true});
  const math=full('复习资料','数学第一章'),english=full('复习资料','英语第一章','UTF-8','section');
  await fs.writeFile(path.join(root,'Batch/math-one.html'),math);await fs.writeFile(path.join(root,'Batch/english-one.htm'),english);
  await fs.writeFile(path.join(root,'Batch/fragment.html'),contents('无完整文档头的网页片段','article'));
  await fs.writeFile(path.join(root,'Mixed/math-one.html'),math);await fs.writeFile(path.join(root,'Mixed/invalid.html'),'This is not HTML.');
  const gbk=full('中文编码网页','中文编码卡片','GBK');
  const target=path.join(root,'Mixed/legacy-gbk.htm').replace(/'/g,"''"),encoded=Buffer.from(gbk).toString('base64');
  execFileSync('powershell.exe',['-NoProfile','-Command',`[IO.File]::WriteAllBytes('${target}',[Text.Encoding]::GetEncoding(936).GetBytes([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))))`],{windowsHide:true});
  const utf16=full('UTF16 课程资料','UTF16 中文卡片','UTF-16','article');await fs.writeFile(path.join(root,'utf16.html'),Buffer.concat([Buffer.from([255,254]),Buffer.from(utf16,'utf16le')]));
  await fs.writeFile(path.join(root,'math-update.html'),full('更新后的源文件标题','数学更新内容'));
  console.log(root);
})().catch(e=>{console.error(e);process.exitCode=1;});
