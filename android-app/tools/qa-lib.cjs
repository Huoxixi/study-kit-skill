const fs = require('node:fs/promises');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const appRoot=path.resolve(__dirname,'..');
const adb=path.join(appRoot,'.toolchain/platform-tools/platform-tools/adb.exe');
const serial='emulator-5580';
const env={...process.env,ANDROID_USER_HOME:path.join(appRoot,'.toolchain/android-user')};
function command(args,options={}){return execFileSync(adb,['-s',serial,...args],{env,windowsHide:true,maxBuffer:40*1024*1024,...options});}
function shell(...args){return command(['shell',...args]).toString('utf8').trim();}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function entities(s){return s.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function dump(){const name='/sdcard/studykit-window-'+Date.now()+'.xml';const result=shell('uiautomator','dump',name);if(result.includes('ERROR'))throw Error('Android UI is changing');const xml=shell('cat',name);shell('rm',name);return [...xml.matchAll(/<node\b([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],entities(x[2])])));}
function visible(node){const c=node.bounds?.match(/-?\d+/g)?.map(Number);return c&&c[2]>c[0]&&c[3]>c[1]&&(c[1]+c[3])/2>80&&(c[1]+c[3])/2<2280;}
async function click(match,timeout=12000){const until=Date.now()+timeout;let nodes=[];do{try{nodes=dump();}catch{await wait(300);continue;}const node=nodes.find(n=>visible(n)&&match(n));if(node){const coords=node.bounds.match(/-?\d+/g).map(Number);shell('input','tap',String(Math.round((coords[0]+coords[2])/2)),String(Math.round((coords[1]+coords[3])/2)));await wait(300);return node;}await wait(400);}while(Date.now()<until);throw Error('UI element not found: '+nodes.filter(n=>n.text||n['content-desc']).map(n=>n.text||n['content-desc']).join(' | '));}
const text=label=>n=>n.text===label||n['content-desc']===label;
async function screenshot(name){const output=path.join(appRoot,'qa',name+'.png');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,command(['exec-out','screencap','-p']));return output;}
async function selectDownload(label){await wait(500);let nodes=dump();if(!nodes.some(n=>/^(Downloads|下载)$/.test(n.text))){await click(n=>/Show roots|显示根目录|显示导航栏|Open navigation drawer/.test(n['content-desc']));await click(n=>/^(Downloads|下载)$/.test(n.text));}for(let i=0;i<10;i++){nodes=dump();if(nodes.some(n=>visible(n)&&text(label)(n))){await click(text(label));await wait(800);return;}shell('input','swipe','530','1850','530','750','300');await wait(300);}throw Error('Download file not visible: '+label);}
module.exports={fs,path,appRoot,adb,serial,env,command,shell,wait,dump,click,text,screenshot,selectDownload};
