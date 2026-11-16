const q=require('./qa-multi-lib.cjs'),assert=require('node:assert/strict');
const report={checks:[],environment:'Android 15 emulator; no physical phone'};
async function pass(name){report.checks.push(name);console.log('PASS '+name);}
(async()=>{
  const existing=q.metas();report.documentCount=existing.length;
  q.command(['install','-r',q.path.join(q.appRoot,'dist/StudyKit-Reader-1.1.0.apk')]);
  q.shell('am','force-stop','cn.studykit.reader');q.shell('am','start','-f','0x10008000','-n','cn.studykit.reader/.MainActivity');await q.wait(700);
  const info=q.shell('dumpsys','package','cn.studykit.reader');assert(/versionName=1\.1\.0/.test(info));assert(!/pkgFlags=\[[^\]]*DEBUGGABLE/.test(info));assert(!info.includes('android.permission.INTERNET'));
  await pass('Version 1.1.0 release is installed, non-debuggable and has no Internet permission');
  assert(q.dump().some(n=>n.text===`全部课程 · ${existing.length} 份资料`));await pass('Release installation retains every imported HTML');
  await q.filter('未分类');let page=await q.openFile('math-update.html');assert.equal(await page.locator('#count').innerText(),'2');await q.library();await pass('Release renders the generic course and preserves the learning record');
  await q.filter('English');await q.importOne('restore.studybackup.json');await q.click(q.text('恢复备份'));page=await q.connect();assert.equal(await page.locator('#count').innerText(),'2');await q.library();
  assert(q.dump().some(n=>n.text==='Calculus'));assert(q.dump().some(n=>n.text==='MathNotes'));await pass('Restoring a backup selects its restored course so the document stays visible');
  await q.menu('math-update.html','更新 HTML');await q.selectDownload('MultiCourse');await q.selectDownload('restore.studybackup.json');await q.click(q.text('完成'));
  page=await q.openFile('math-update.html');assert.equal(await page.locator('#count').innerText(),'2');assert.equal(await page.locator('#lesson').innerText(),'数学更新内容');await q.library();await pass('Choosing a backup in Update HTML is rejected without replacing current progress');
  await q.filter('高等数学');page=await q.openFile('math-update.html');assert.equal(await page.locator('#count').innerText(),'3');await q.library();await pass('Same-named documents in different courses retain independent records in the release');
  await q.filter('全部课程');await q.search('');report.screenshot=await q.screenshot('multi-08-release-library');report.passed=true;
  report.limitations=['Only Android 15 emulator tested. The userdebug OS forces WebView debugging despite the release API setting; see R83.'];
})().catch(async error=>{report.passed=false;report.error=error.stack;console.error(error.stack);try{await q.screenshot('multi-release-failure');}catch{}process.exitCode=1;}).finally(async()=>{await q.fs.writeFile(q.path.join(q.appRoot,'qa/release-1.1.0.json'),JSON.stringify(report,null,2));await q.close();});
