const q=require('./qa-multi-lib.cjs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const report={checks:[],screenshots:[]};
(async()=>{
  const apk=q.path.join(q.appRoot,'dist/StudyKit-Reader-1.1.0.apk');q.command(['install','-r',apk]);q.shell('am','force-stop','cn.studykit.reader');q.shell('am','start','-f','0x10008000','-n','cn.studykit.reader/.MainActivity');await q.wait(700);
  assert(q.dump().some(n=>n.text==='全部课程 · 5 份资料'));report.checks.push('Final APK installation retains all five test documents');
  await q.click(q.text('资料排序'));await q.click(q.text('最近导入'));assert(q.dump().some(n=>n.text==='最近导入'));report.screenshots.push(await q.screenshot('multi-09-final-normal-controls'));
  q.shell('settings','put','system','font_scale','1.3');q.shell('cmd','uimode','night','yes');await q.wait(900);await q.filter('高等数学');assert(q.dump().some(n=>n.text==='最近导入'));assert(q.dump().some(n=>n.text==='高等数学'));report.screenshots.push(await q.screenshot('multi-10-final-dark-controls'));report.checks.push('Course and sort selectors remain usable in normal and enlarged dark layouts');
  const page=await q.openFile('math-update.html');assert.equal(await page.locator('#count').innerText(),'3');await q.library();report.checks.push('Final APK still opens the independent Chinese course with its existing progress');
  q.shell('settings','put','system','font_scale','1.0');q.shell('cmd','uimode','night','no');await q.wait(600);await q.filter('全部课程');await q.search('');report.screenshots.push(await q.screenshot('multi-11-final-release-library'));
  const bytes=await q.fs.readFile(apk);report.sha256=crypto.createHash('sha256').update(bytes).digest('hex');report.bytes=bytes.length;report.passed=true;console.log(JSON.stringify(report,null,2));
})().catch(e=>{report.passed=false;report.error=e.stack;console.error(e.stack);process.exitCode=1;}).finally(async()=>{await q.fs.writeFile(q.path.join(q.appRoot,'qa/final-ui-1.1.0.json'),JSON.stringify(report,null,2));await q.close();});
