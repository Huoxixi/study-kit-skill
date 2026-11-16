// A small direct CDP client: Android WebView does not implement desktop browser contexts.
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(url){
  const targets=await (await fetch(url+'/json/list')).json();
  const target=targets.find(t=>t.type==='page'&&t.url.includes('.study-kit.invalid'))||targets.find(t=>t.type==='page');
  if(!target)throw Error('No Android WebView page target');
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let id=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const data=JSON.parse(String(event.data));const waiter=pending.get(data.id);if(!waiter)return;pending.delete(data.id);data.error?waiter.reject(Error(data.error.message)):waiter.resolve(data.result);});
  function send(method,params={}){return new Promise((resolve,reject)=>{const seq=++id;const timer=setTimeout(()=>{pending.delete(seq);reject(Error('CDP timeout: '+method));},12000);pending.set(seq,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:x=>{clearTimeout(timer);reject(x);}});socket.send(JSON.stringify({id:seq,method,params}));});}
  const page={
    async evaluate(fn,arg){const expression=typeof fn==='function'?'('+fn.toString()+')('+(arg===undefined?'':JSON.stringify(arg))+')':fn;const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;},
    async waitForFunction(fn,arg){const deadline=Date.now()+15000;do{try{if(await page.evaluate(fn,arg))return;}catch{}await delay(100);}while(Date.now()<deadline);throw Error('WebView condition timed out: '+fn);},
    async waitForSelector(selector){await page.waitForFunction(s=>!!document.querySelector(s),selector);},
    locator(selector){return {
      click:()=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)throw Error('Missing element: '+s);e.click();},selector),
      check:()=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)throw Error('Missing checkbox: '+s);if(!e.checked)e.click();},selector),
      fill:value=>page.evaluate(({selector,value})=>{const e=document.querySelector(selector);if(!e)throw Error('Missing input: '+selector);e.focus();e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}, {selector,value}),
      innerText:()=>page.evaluate(s=>document.querySelector(s)?.innerText,selector)
    };}
  };
  return {page,close:async()=>socket.close()};
}
module.exports={connect};
