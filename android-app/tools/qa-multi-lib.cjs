const q=require('./qa-lib.cjs');
const cdp=require('./webview-cdp.cjs');
let connection,page;
async function connect(selector='#lesson'){
  const until=Date.now()+20000;let last;
  do{try{const pid=q.shell('pidof','cn.studykit.reader').split(' ')[0];q.command(['forward','tcp:9224','localabstract:webview_devtools_remote_'+pid]);connection=await cdp.connect('http://127.0.0.1:9224');page=connection.page;await page.waitForSelector(selector);return page;}catch(e){last=e;await close();await q.wait(400);}}while(Date.now()<until);throw last;
}
async function close(){if(connection)await connection.close();connection=page=null;}
async function library(){await close();await q.click(q.text('返回资料库'));await q.wait(700);}
function metas(){const files=q.shell('run-as','cn.studykit.reader','find','files/courses','-name','meta.json').split(/\r?\n/).filter(Boolean);return files.map(file=>JSON.parse(q.command(['exec-out','run-as','cn.studykit.reader','cat',file]).toString('utf8')));}
async function keyboardOff(){const info=q.shell('dumpsys','input_method');if(/mInputShown=true|isInputViewShown=true|mIsInputViewShown=true/.test(info)){q.shell('input','keyevent','4');await q.wait(250);}}
async function replaceText(value,match=n=>n.class==='android.widget.EditText'){
  await q.click(match);q.shell('input','keycombination','113','29');q.shell('input','keyevent','67');
  if(value)q.shell('input','text',value.replace(/ /g,'%s'));
  await keyboardOff();await q.wait(200);
}
async function search(value){await replaceText(value,q.text('搜索资料'));}
async function openFile(filename,selector='#lesson'){
  await search(filename);await q.click(n=>n['content-desc'].startsWith('打开资料：'));return connect(selector);
}
async function menu(filename,action){await search(filename);await q.click(n=>n.text==='管理');await q.click(q.text(action));}
async function filter(name){await q.click(q.text('课程筛选'));await q.click(q.text(name));await q.wait(300);}
async function importOne(name){await q.click(q.text('导入 HTML'));await q.selectDownload('MultiCourse');await q.selectDownload(name);}
async function importMany(names,folder='Batch'){
  await q.click(q.text('导入 HTML'));await q.selectDownload('MultiCourse');if(folder)await q.selectDownload(folder);
  let first=q.dump().find(n=>n.text===names[0]);if(!first)throw Error('First file not visible');
  const c=first.bounds.match(/\d+/g).map(Number),x=Math.round((c[0]+c[2])/2),y=Math.round((c[1]+c[3])/2);
  q.shell('input','swipe',String(x),String(y),String(x),String(y),'1000');await q.wait(400);
  for(const name of names.slice(1))await q.click(q.text(name));
  await q.click(n=>/^(OPEN|Open|SELECT|Select|打开|选择)$/.test(n.text)||/^(Open|Select|打开|选择)$/.test(n['content-desc']));await q.wait(800);
}
async function savePicker(){await q.click(n=>/^(SAVE|Save|保存)$/.test(n.text));await q.click(q.text('知道了'));}
module.exports={...q,connect,close,library,metas,replaceText,search,openFile,menu,filter,importOne,importMany,savePicker};
