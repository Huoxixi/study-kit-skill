const q=require('./qa-multi-lib.cjs'),assert=require('node:assert/strict');
const report={checks:[]};
(async()=>{
  const until=Date.now()+90000;while(q.shell('getprop','sys.boot_completed')!=='1'){if(Date.now()>until)throw Error('Boot timeout');await q.wait(2000);}
  const info=q.shell('dumpsys','package','cn.studykit.reader');assert(/versionName=1\.0\.0/.test(info),'Migration must start with installed 1.0.0');
  q.shell('am','force-stop','cn.studykit.reader');q.shell('am','start','-n','cn.studykit.reader/.MainActivity');
  await q.click(n=>n.text==='继续学习');const old=await q.connect('#card-title,#question-title');
  await old.evaluate(()=>localStorage.setItem('upgrade-proof','1.0.0-to-1.1.0'));
  const baseline=await old.evaluate(()=>({origin:location.origin,progress:JSON.parse(localStorage.getItem('ai41.study.v1'))}));
  await q.library();
  q.command(['install','-r',q.path.join(q.appRoot,'dist/StudyKit-Reader-QA.apk')]);q.shell('am','start','-n','cn.studykit.reader/.MainActivity');await q.wait(800);
  const all=q.metas();assert(all.length>=2);report.checks.push('Cover installation retains legacy document metadata');
  await q.click(n=>n['content-desc'].startsWith('打开资料：'));const current=await q.connect('#card-title,#question-title');
  assert.equal(await current.evaluate(()=>location.origin),baseline.origin);assert.equal(await current.evaluate(()=>localStorage.getItem('upgrade-proof')),'1.0.0-to-1.1.0');
  assert.deepEqual(await current.evaluate(()=>JSON.parse(localStorage.getItem('ai41.study.v1'))),baseline.progress);report.checks.push('Stable origins preserve every original bookmark, answer and draft on upgrade');
  assert.equal(await current.evaluate(()=>window.AI41_DATA.cards.length),141);assert.equal(await current.evaluate(()=>window.AI41_DATA.questions.length),212);report.checks.push('Existing workshop course still renders all 141 cards and 212 questions');
  report.screenshot=await q.screenshot('multi-01-upgraded-existing-course');report.passed=true;console.log(JSON.stringify(report));
})().catch(e=>{report.passed=false;report.error=e.stack;console.error(e.stack);process.exitCode=1;}).finally(async()=>{await q.fs.writeFile(q.path.join(q.appRoot,'qa/migration-1.1.0.json'),JSON.stringify(report,null,2));await q.close();});
