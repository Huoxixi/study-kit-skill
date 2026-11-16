const q=require('./qa-multi-lib.cjs'),assert=require('node:assert/strict');
const reportPath=q.path.join(q.appRoot,'qa/multicourse-1.1.0.json');
let report={environment:'Android 15 / WebView 124 / WHPX emulator; not a physical phone',checks:[],screenshots:[]};
let currentStage=0;
const fixture=q.path.join(q.appRoot,'qa/multicourse-fixtures');
const byFile=name=>q.metas().find(row=>row.filename===name);
async function pass(name){report.stage=currentStage;report.checks.push({stage:currentStage,name,passed:true});await q.fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log('PASS '+name);}
async function shot(name){report.screenshots.push(await q.screenshot(name));}
async function home(){await q.close();q.shell('am','force-stop','cn.studykit.reader');q.shell('am','start','-f','0x10008000','-n','cn.studykit.reader/.MainActivity');await q.wait(600);}
async function newGroup(name){await q.click(q.text('课程管理'));await q.click(q.text('新建课程'));await q.replaceText(name);await q.click(q.text('保存'));}
async function groupAction(group,action){await q.click(q.text('课程管理'));await q.click(n=>n.text.startsWith(group+'（'));await q.click(q.text(action));}
async function upload(name,local){const remote='/sdcard/Download/MultiCourse/'+name;q.command(['push',local,remote]);q.shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+remote);}
const stages=[
  async()=>{
    q.command(['install','-r',q.path.join(q.appRoot,'dist/StudyKit-Reader-QA.apk')]);q.shell('am','force-stop','cn.studykit.reader');q.shell('pm','clear','cn.studykit.reader');
    q.shell('rm','-rf','/sdcard/Download/MultiCourse');q.shell('mkdir','-p','/sdcard/Download/MultiCourse/Batch','/sdcard/Download/MultiCourse/Mixed');
    for(const folder of ['Batch','Mixed'])for(const name of await q.fs.readdir(q.path.join(fixture,folder)))await upload(folder+'/'+name,q.path.join(fixture,folder,name));
    for(const name of ['utf16.html','math-update.html'])await upload(name,q.path.join(fixture,name));
    q.shell('svc','wifi','disable');q.shell('svc','data','disable');await home();await newGroup('Math');await pass('Create an empty course and select it as the import destination');await shot('multi-02-empty-course');
  },
  async()=>{
    await home();await q.filter('Math');await q.importMany(['math-one.html','english-one.htm','fragment.html']);await q.click(q.text('完成'));
    const rows=q.metas();assert.equal(rows.length,3);assert(rows.every(r=>r.subject==='Math'));const same=rows.filter(r=>r.title==='复习资料');assert.equal(same.length,2);assert.notEqual(same[0].id,same[1].id);
    await pass('System picker imports several HTML/HTM documents at once; identical titles remain separate');await shot('multi-03-batch-library');
  },
  async()=>{
    await home();await q.filter('Math');await q.importMany(['math-one.html','invalid.html','legacy-gbk.htm'],'Mixed');await q.click(q.text('完成'));
    assert.equal(q.metas().length,4);assert.equal(q.metas().filter(r=>r.filename==='math-one.html').length,1);await pass('Mixed batch keeps valid imports, skips an exact duplicate and reports the invalid file');
    let page=await q.openFile('legacy-gbk.htm');assert.equal(await page.locator('#lesson').innerText(),'中文编码卡片');await q.library();
    page=await q.openFile('fragment.html');assert.match(await page.locator('#lesson').innerText(),/网页片段/);await page.locator('#done').click();assert.equal(await page.locator('#count').innerText(),'1');await q.library();
    await newGroup('English');await q.importOne('utf16.html');page=await q.connect();assert.equal(await page.locator('#lesson').innerText(),'UTF16 中文卡片');assert.equal(byFile('utf16.html').subject,'English');await page.locator('#done').click();await q.library();
    await pass('GBK HTML, UTF-16 HTML and body-only fragments render Chinese text and run their own interactions');await shot('multi-04-course-filters');
  },
  async()=>{
    await home();await q.filter('Math');let page=await q.openFile('math-one.html');await page.locator('#done').click();await page.locator('#done').click();assert.equal(await page.locator('#count').innerText(),'2');await page.locator('#answer').click();assert.equal(await page.evaluate(()=>document.getElementById('answer-text').hidden),false);const origin=await page.evaluate(()=>location.origin);await q.library();
    page=await q.openFile('english-one.htm');assert.equal(await page.locator('#count').innerText(),'0');await page.locator('#done').click();assert.notEqual(await page.evaluate(()=>location.origin),origin);await q.library();await home();await q.filter('Math');page=await q.openFile('math-one.html');assert.equal(await page.locator('#count').innerText(),'2');await q.library();
    await pass('Different HTML layouts sharing the same localStorage key remain isolated across force-stop and relaunch');
    await q.search('missing-course');assert(q.dump().some(n=>n.text==='没有找到匹配的资料'));await q.search('math-one');assert(q.dump().some(n=>/1 份资料/.test(n.text)));await pass('Search filters actual file names and provides a recoverable no-results state');
  },
  async()=>{
    await home();await q.filter('Math');await q.menu('math-one.html','重命名');await q.replaceText('MathNotes');await q.click(q.text('保存'));assert.equal(byFile('math-one.html').title,'MathNotes');
    await q.menu('math-one.html','置顶');assert.equal(byFile('math-one.html').pinned,true);
    await q.menu('math-one.html','更新 HTML');await q.selectDownload('MultiCourse');await q.selectDownload('math-update.html');let page=await q.connect();assert.equal(await page.locator('#lesson').innerText(),'数学更新内容');assert.equal(await page.locator('#count').innerText(),'2');await q.library();assert.equal(byFile('math-update.html').title,'MathNotes');assert.equal(byFile('math-update.html').pinned,true);
    await pass('Rename, pin and explicitly update an HTML while preserving its custom name and progress');
    await q.menu('english-one.htm','设置课程');await q.click(q.text('English'));assert.equal(byFile('english-one.htm').subject,'English');
    await groupAction('Math','重命名课程');await q.replaceText('Calculus');await q.click(q.text('保存'));assert.equal(byFile('math-update.html').subject,'Calculus');assert.equal(byFile('fragment.html').subject,'Calculus');
    await q.filter('Calculus');await q.search('');await q.click(q.text('资料排序'));await q.click(q.text('名称排序'));assert(q.dump().some(n=>n.text.startsWith('已置顶')));
    await pass('Move documents between courses, rename a course and sort while respecting pinned items');await shot('multi-05-managed-courses');
  },
  async()=>{
    await home();await q.filter('Calculus');let page=await q.openFile('math-update.html');await q.click(q.text('资料与学习进度备份'));await q.savePicker();
    const files=q.shell('find','/sdcard/Download','-maxdepth','4','-type','f').split(/\r?\n/);const backupFile=files.find(file=>file.includes('MathNotes-')&&file.endsWith('.studybackup.json'));assert(backupFile,'Backup not found');
    const backupPath=q.path.join(fixture,'full-backup.json');q.command(['pull',backupFile,backupPath]);const data=JSON.parse(await q.fs.readFile(backupPath,'utf8'));assert.equal(data.title,'MathNotes');assert.equal(data.subject,'Calculus');assert.equal(data.pinned,true);assert.equal(data.filename,'math-update.html');
    await page.locator('#done').click();assert.equal(await page.locator('#count').innerText(),'3');await q.library();await q.menu('math-update.html','取消置顶');await q.menu('math-update.html','设置课程');await q.click(q.text('English'));await upload('restore.studybackup.json',backupPath);
    await q.importOne('restore.studybackup.json');await q.click(q.text('恢复备份'));page=await q.connect();assert.equal(await page.locator('#count').innerText(),'2');const restored=byFile('math-update.html');assert.equal(restored.subject,'Calculus');assert.equal(restored.pinned,true);assert.equal(restored.title,'MathNotes');await q.library();
    await pass('Complete backup restores course classification, file name, custom label, pin and the original learning state');
    const portable={...data,subject:'高等数学',title:'中文课程示例',courseId:'f'.repeat(32)};const portablePath=q.path.join(fixture,'portable.studybackup.json');await q.fs.writeFile(portablePath,JSON.stringify(portable));await upload('portable.studybackup.json',portablePath);
    await q.importOne('portable.studybackup.json');page=await q.connect();assert.equal(await page.locator('#count').innerText(),'2');await page.locator('#done').click();await q.library();assert(q.metas().some(r=>r.subject==='高等数学'&&r.title==='中文课程示例'));
    await q.filter('Calculus');page=await q.openFile('math-update.html');assert.equal(await page.locator('#count').innerText(),'2');await q.library();await pass('Portable backups can add a Chinese-named course with separate progress');
  },
  async()=>{
    await home();const before=q.metas().length;await groupAction('Calculus','移除课程分类');await q.click(q.text('移除分类'));assert.equal(q.metas().length,before);assert.equal(byFile('math-update.html').subject,'');let page=await q.openFile('math-update.html');assert.equal(await page.locator('#count').innerText(),'2');await q.library();await pass('Removing a course classification keeps all HTML and learning records');
    await q.filter('English');await q.menu('english-one.htm','删除资料');await q.click(q.text('删除'));assert.equal(q.metas().length,before-1);assert(!byFile('english-one.htm'));page=await q.openFile('utf16.html');assert.equal(await page.locator('#count').innerText(),'1');await q.library();await pass('Deleting one HTML does not delete other courses or their progress');
    await q.filter('全部课程');await q.search('');q.shell('settings','put','system','font_scale','1.3');q.shell('cmd','uimode','night','yes');await q.wait(1000);await shot('multi-06-dark-large-text');assert(q.dump().some(q.text('导入 HTML')));
    q.shell('settings','put','system','font_scale','1.0');q.shell('cmd','uimode','night','no');await q.wait(700);await shot('multi-07-final-library');await pass('Course library, search and fixed import action remain usable with dark mode and enlarged text');
  }
];
(async()=>{
  const start=Number(process.argv.find(arg=>arg.startsWith('--from='))?.split('=')[1]||1);
  if(start>1){report=JSON.parse(await q.fs.readFile(reportPath,'utf8'));report.checks=report.checks.filter(c=>c.stage<start);delete report.error;delete report.passed;}
  if(start>1)for(const file of q.shell('find','/sdcard/Download/MultiCourse','-type','f').split(/\r?\n/).filter(Boolean))q.shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+file);
  for(let i=start-1;i<stages.length;i++){currentStage=i+1;console.log('STAGE '+currentStage);await stages[i]();}
  report.passed=true;report.stage=7;report.screenshots=[...new Set(report.screenshots.filter(file=>!file.endsWith('multi-failure.png')))];
})().catch(async error=>{report.passed=false;report.stage=currentStage;report.error=error.stack;console.error(error.stack);try{await shot('multi-failure');await q.fs.writeFile(q.path.join(q.appRoot,'qa/multi-failure-ui.json'),JSON.stringify(q.dump(),null,2));}catch{}process.exitCode=1;}).finally(async()=>{await q.fs.writeFile(reportPath,JSON.stringify(report,null,2));await q.close();});
