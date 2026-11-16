(() => {
  'use strict';
  const DATA = window.AI41_DATA;
  if (!DATA || !DATA.cards?.length) return;
  const $ = (s, root = document) => root.querySelector(s);
  const cards = new Map(DATA.cards.map(x => [x.id, x]));
  const questions = new Map(DATA.questions.map(x => [x.id, x]));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${({bookmark:'<path d="M5 3h14v18l-7-4-7 4z"/>',check:'<path d="m5 12 4 4L19 6"/>',cross:'<path d="m6 6 12 12M18 6 6 18"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',chevron:'<path d="m6 9 6 6 6-6"/>'})[name] || ''}</svg>`;
  const KEY = 'ai41.study.v1';
  const fresh = () => ({schema:1,savedCards:[],savedQuestions:[],mastery:{},attempts:{},drafts:{},rubrics:{},last:{view:'cards',card:'K080',question:'Q-RAG',topic:'rag'}});
  let progress = fresh(), storageOK = true, toastTimer, draftTimer;
  const ui = {view:'cards',card:'K080',question:'Q-RAG',topic:'rag',tab:'concept',savedTab:'cards',type:'all',source:'all',practice:'all',related:null,returnTo:null,searchKind:'all',pinnedQuestion:null};
  const selection = new Map(), retrying = new Set();
  const readingPositions = new Map();
  const readingObserver = new ResizeObserver(() => refreshReaders());
  try { history.scrollRestoration = 'manual'; } catch { /* Some local viewers restrict history. */ }
  const typeLabel = {single:'单选',multi:'多选',boolean:'判断',short:'简答 / 操作'};
  const masteryLabel = {weak:'还没理解',learning:'基本理解',done:'已掌握'};
  function cleanProgress(input) {
    if (!input || typeof input !== 'object' || input.schema !== 1) throw Error('不支持的进度格式，请选择本站导出的 JSON 文件。');
    const out = fresh();
    for (const [field, map] of [['savedCards', cards],['savedQuestions', questions]]) {
      if (input[field] !== undefined && !Array.isArray(input[field])) throw Error('收藏记录格式不正确。');
      out[field] = [...new Set((input[field] || []).filter(x => typeof x === 'string' && map.has(x)))];
    }
    if (input.mastery && typeof input.mastery === 'object') for (const [id,v] of Object.entries(input.mastery)) if(cards.has(id) && ['weak','learning','done'].includes(v)) out.mastery[id] = v;
    if (input.drafts && typeof input.drafts === 'object') for (const [id,v] of Object.entries(input.drafts)) if(questions.get(id)?.type === 'short' && typeof v === 'string') out.drafts[id] = v.slice(0,20000);
    if (input.rubrics && typeof input.rubrics === 'object') for (const [id,v] of Object.entries(input.rubrics)) if(questions.get(id)?.type === 'short' && Array.isArray(v)) out.rubrics[id] = v.filter(n => Number.isInteger(n) && n >= 0 && n < questions.get(id).rubric.length);
    if (input.attempts && typeof input.attempts === 'object') for (const [id,v] of Object.entries(input.attempts)) {
      const q = questions.get(id);
      if(!q || !v || typeof v !== 'object') continue;
      const chosen = Array.isArray(v.selected) ? [...new Set(v.selected.filter(x => q.options?.some(o => o.id === x)))] : [];
      const result = q.type === 'short' ? (['self-weak','self-done'].includes(v.result) ? v.result : 'review') : q.disputed ? 'review' : equal(chosen,q.answer) ? 'correct' : 'wrong';
      out.attempts[id] = {selected:chosen,result,at:typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at)) ? v.at : new Date(0).toISOString(),count:Math.max(1,Math.min(100000,Number(v.count)||1)),wrongCount:Math.max(0,Math.min(100000,Number(v.wrongCount)||0))};
    }
    if(input.last && typeof input.last === 'object') {
      if(['cards','quiz','saved'].includes(input.last.view)) out.last.view = input.last.view;
      if(cards.has(input.last.card)) out.last.card = input.last.card;
      if(questions.has(input.last.question)) out.last.question = input.last.question;
      if(validTopic(input.last.topic)) out.last.topic = input.last.topic;
    }
    return out;
  }
  function validTopic(t) { return t === 'all' || DATA.topics.some(x => x.id === t) || DATA.domains.some(x => x.id === t); }
  function equal(a,b) { return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|'); }
  try { const stored = localStorage.getItem(KEY); if(stored) progress = cleanProgress(JSON.parse(stored)); } catch { storageOK = false; }
  Object.assign(ui, {view:progress.last.view,card:progress.last.card,question:progress.last.question,topic:progress.last.topic});
  function save() {
    progress.last = {view:ui.view,card:ui.card,question:ui.question,topic:ui.topic};
    try { localStorage.setItem(KEY,JSON.stringify(progress)); storageOK = true; } catch { storageOK = false; }
    $('#storage-warning').hidden = storageOK;
  }
  function toast(message) {
    clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; },3000);
  }
  function paragraphs(text) { return String(text || '').split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join(''); }
  function links(sources) { return sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join(''); }
  function topicSelect() {
    const option = x => `<option value="${x.id}"${ui.topic === x.id ? ' selected' : ''}>${esc(x.label)}</option>`;
    return `<label class="sr-only" for="topic-select">选择复习主题或大纲领域</label><select id="topic-select" aria-label="选择复习主题或大纲领域"><option value="all"${ui.topic === 'all' ? ' selected' : ''}>全部知识与题目</option><optgroup label="复习专题">${DATA.topics.map(option).join('')}</optgroup><optgroup label="完整大纲 · 13 个领域">${DATA.domains.map(option).join('')}</optgroup></select>`;
  }
  function matchesTopic(item, isQuestion = false) {
    return ui.topic === 'all' || (isQuestion ? item.topics.includes(ui.topic) || item.domains.includes(ui.topic) : item.topic === ui.topic || item.domainId === ui.topic);
  }
  function cardPool() { return DATA.cards.filter(c => matchesTopic(c)); }
  function isWrong(q) { return ['wrong','self-weak'].includes(progress.attempts[q.id]?.result); }
  function questionPool() {
    return DATA.questions.filter(q => matchesTopic(q,true)
      && (ui.type === 'all' || q.type === ui.type)
      && (ui.source === 'all' || q.source === ui.source)
      && (!ui.related || q.related.includes(ui.related))
      && (ui.practice !== 'wrong' || isWrong(q) || q.id===ui.pinnedQuestion)
      && (ui.practice !== 'unanswered' || !progress.attempts[q.id] || q.id===ui.pinnedQuestion));
  }
  function position(index, total) { return `${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`; }
  function setRoute(push = false) {
    const hash = ui.view === 'saved' ? '#saved/'+ui.savedTab : '#'+ui.view+'/'+(ui.view === 'cards' ? ui.card : ui.question);
    if(location.hash !== hash) try { history[push ? 'pushState' : 'replaceState'](null,'',hash); } catch { /* local file viewers may restrict history; the app remains usable. */ }
  }
  function showItem(kind,id,push = true) {
    ui.related = null; ui.returnTo = null; ui.pinnedQuestion=null;
    if(kind === 'cards' && cards.has(id)) { ui.view='cards'; ui.card=id; ui.topic=cards.get(id).topic; ui.tab='concept'; }
    else if(kind === 'quiz' && questions.has(id)) { ui.view='quiz'; ui.question=id; ui.topic='all'; ui.type='all'; ui.source='all'; ui.practice='all'; }
    else return;
    setRoute(push); render(); save();
  }
  function render() {
    rememberReaders();
    for(const nav of document.querySelectorAll('[data-nav]')) {
      const active = nav.dataset.nav === ui.view; nav.classList.toggle('active',active);
      if(active) nav.setAttribute('aria-current','page'); else nav.removeAttribute('aria-current');
    }
    $('#storage-warning').hidden = storageOK;
    $('#main').classList.toggle('saved-view',ui.view === 'saved');
    $('#main').classList.toggle('quiz-view',ui.view === 'quiz');
    if(ui.view === 'cards') renderCard(); else if(ui.view === 'quiz') renderQuestion(); else renderSaved();
    if(ui.view === 'saved') {
      const list=$('#workspace .result-list') || $('#workspace .empty-state');
      if(list) {
        const area=document.createElement('div');area.id='saved-content';area.className='reading-area saved-content';area.dataset.scrollKey='saved/'+ui.savedTab;area.setAttribute('aria-label','收藏列表');
        list.before(area);area.append(list);area.insertAdjacentHTML('afterend',readerControls('saved-content'));
      }
    }
    const toolbar=$('#toolbar');
    toolbar.classList.toggle('switch-only',ui.view==='saved');
    const destination=document.createElement('a');
    destination.className='site-switch-link';destination.href='https://www.panyandingxian.cn/';
    destination.setAttribute('aria-label','切换到攀岩网站');
    destination.innerHTML='攀岩网站 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
    toolbar.append(destination);
    prepareReaders();
    setRoute();
  }
  function sourceBody(item, isCard) {
    const body = isCard
      ? `<p>${esc(item.id)} · ${esc(item.domain)} / ${esc(item.unit)} · ${esc(item.level)}</p><p>${item.kind === 'syllabus' ? '大纲原条目' : '样卷展开主题'}：${esc(item.point)}</p><p><strong>考试范围依据</strong></p>${links(item.scopeSources)}${item.conceptSources.length ? `<p><strong>概念依据</strong> · 据以下资料整理，非考试院逐字定义。</p>${links(item.conceptSources.map(s => ({...s,label:s.category+' · '+s.label})))}` : '<p>本卡为考纲范围说明。考纲未在此条给出完整定义，正文按该范围作简要解释。</p>'}${item.sourceNote ? `<p>${esc(item.sourceNote)}</p>` : ''}<p>例子为自写的日常说明；类比只用于帮助理解，不代替概念。</p>${item.kind === 'supplement' ? '<p>此卡为样卷考点展开，不另计入 121 个原表条目。</p>' : ''}`
      : `<p>${esc(item.sourceLabel)}${item.points ? ' · 原卷 '+item.points+' 分' : ''}。解析为学习参考，不是官方答案或成绩。</p><p><strong>${item.source === 'official' ? '题目来源' : '对应范围与依据'}</strong></p>${links(item.sources)}${item.analysisSources?.length ? `<p><strong>解析依据</strong></p>${links(item.analysisSources)}` : ''}`;
    return `<div class="source-body">${body}</div>`;
  }
  function sourceDetails(item, isCard) {
    return `<div class="sources"><button class="source-trigger" data-action="${isCard?'card-sources':'question-sources'}" aria-haspopup="dialog">${isCard?'考点与来源':'来源'} <span aria-hidden="true">↗</span></button><div class="print-source">${sourceBody(item,isCard)}</div></div>`;
  }
  function readerControls(target) {
    return `<nav class="reading-pager" data-reading-target="${target}" aria-label="内容翻页"><button data-action="reading-prev" aria-label="上一页内容"><span class="wide-label">内容</span>上页</button><span class="reading-position" aria-live="polite">1 / 1</span><button data-action="reading-next" aria-label="下一页内容"><span class="wide-label">内容</span>下页</button></nav>`;
  }
  function rememberReaders() {
    for(const area of document.querySelectorAll('.reading-area[data-scroll-key]')) readingPositions.set(area.dataset.scrollKey,area.scrollTop);
  }
  function refreshReader(area) {
    const pager=document.querySelector(`[data-reading-target="${area.id}"]`);if(!pager || !area.clientHeight)return;
    const max=Math.max(0,area.scrollHeight-area.clientHeight), step=Math.max(48,area.clientHeight-56);
    const pages=Math.max(1,Math.ceil(max/step)+1), page=max-area.scrollTop<2?pages:Math.min(pages,Math.floor(area.scrollTop/step)+1);
    $('[data-action=reading-prev]',pager).disabled=area.scrollTop<1;
    $('[data-action=reading-next]',pager).disabled=max-area.scrollTop<2;
    $('.reading-position',pager).textContent=page+' / '+pages;
  }
  function refreshReaders() { for(const area of document.querySelectorAll('.reading-area'))refreshReader(area); }
  function prepareReaders() {
    readingObserver.disconnect();
    for(const area of document.querySelectorAll('.reading-area')) {
      if(!area.hasAttribute('tabindex'))area.tabIndex=0;
      if(!area.dataset.boundReader){
        area.addEventListener('scroll',()=>refreshReader(area),{passive:true});area.dataset.boundReader='true';
        if(area.dataset.scrollKey)area.scrollTop=readingPositions.get(area.dataset.scrollKey)||0;
      }
      readingObserver.observe(area);
    }
    requestAnimationFrame(refreshReaders);
  }
  function pageReading(target, direction) {
    const area=document.getElementById(target);if(!area)return;
    area.scrollTop+=direction*Math.max(48,area.clientHeight-56);refreshReader(area);
  }
  function openSources(isCard) {
    const item=isCard?cards.get(ui.card):questions.get(ui.question);
    $('#source-content').innerHTML=sourceBody(item,isCard);$('#source-content').scrollTop=0;
    $('#source-dialog').showModal();prepareReaders();
  }
  function renderCard() {
    const pool = cardPool();
    if(!pool.length) { $('#toolbar').innerHTML = topicSelect(); $('#workspace').innerHTML = empty('没有匹配的卡片','请切换复习主题，或使用搜索查找完整内容。','全部知识卡片','all-cards'); return; }
    let index = pool.findIndex(c => c.id === ui.card); if(index<0) { index=0;ui.card=pool[0].id; }
    const card=cards.get(ui.card), saved=progress.savedCards.includes(card.id), status=progress.mastery[card.id];
    $('#toolbar').innerHTML = `${topicSelect()}<span class="position" aria-label="卡片位置">${position(index,pool.length)}</span>`;
    let content;
    if(ui.tab === 'concept') content = `<h2>${esc(card.summary)}</h2>${paragraphs(card.concept)}${card.flow ? `<div class="flow">${card.flow.map((step,i) => (i ? '<span aria-hidden="true">→</span>' : '')+`<span>${esc(step)}</span>`).join('')}</div>` : ''}`;
    else if(ui.tab === 'example') content = `<h2>举个例子</h2>${paragraphs(card.example)}`;
    else content = `<h2>容易弄错的地方</h2>${paragraphs(card.pitfall)}`;
    $('#workspace').innerHTML = `<article class="study-panel" aria-labelledby="card-title"><div class="panel-heading"><h1 id="card-title">${esc(card.title)}</h1><button class="icon-btn bookmark${saved?' is-saved':''}" data-action="save-card" aria-label="${saved?'取消收藏':'收藏'}知识卡片" aria-pressed="${saved}">${icon('bookmark')}</button></div><div class="card-tabs" role="tablist" aria-label="卡片内容">${[['concept','概念'],['example','例子'],['pitfall','易错点']].map(([id,label]) => `<button class="card-tab${ui.tab === id?' active':''}" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="card-panel" aria-selected="${ui.tab === id}" tabindex="${ui.tab === id?'0':'-1'}">${label}</button>`).join('')}</div><section id="card-panel" class="card-content reading-area" data-scroll-key="card/${card.id}/${ui.tab}" role="tabpanel" aria-labelledby="tab-${ui.tab}">${content}</section><div class="panel-tools">${readerControls('card-panel')}${sourceDetails(card,true)}</div></article><div class="action-row"><div class="card-actions-left">${ui.returnTo ? '<button class="text-btn back-context" data-action="return-quiz">← <span class="wide-label">返回</span>题目</button>' : ''}<div class="mastery-wrap"><button class="text-btn mastery" data-action="mastery-menu" aria-expanded="false" aria-controls="mastery-menu">${masteryLabel[status]||'标记掌握程度'}</button><div class="mastery-menu" id="mastery-menu" hidden>${Object.entries(masteryLabel).map(([v,t])=>`<button data-mastery="${v}" aria-pressed="${status===v}">${t}${status===v?' ✓':''}</button>`).join('')}<button data-mastery="clear">清除标记</button></div></div></div><button class="primary-btn" data-action="related">练相关题 <span aria-hidden="true">→</span></button></div>${deckNavigation(index,pool.length,'card')}<p class="keyboard-hint">用 ← → 切换卡片</p>`;
  }
  function deckNavigation(index,total,kind) {
    return `<div class="deck-nav"><button class="text-btn" data-action="prev-${kind}"${index<=0?' disabled':''}>← ${kind==='card'?'上一张':'上一题'}</button><div class="deck-middle"><span>${position(index,total)}</span>${kind==='card'?'<button class="text-btn random-link" data-action="random-card">随机</button>':''}</div><button class="text-btn" data-action="next-${kind}"${index>=total-1?' disabled':''}>${kind==='card'?'下一张':'下一题'} →</button></div>`;
  }
  function empty(title,message,actionLabel,action) { return `<div class="empty-state"><h2>${esc(title)}</h2><p>${esc(message)}</p><button class="primary-btn" data-action="${action}">${esc(actionLabel)}</button></div>`; }
  function filterSelect(name,label,values,current) {
    return `<label class="sr-only" for="filter-${name}">${label}</label><select class="filter-select" id="filter-${name}" data-filter="${name}" aria-label="${label}">${values.map(([v,t])=>`<option value="${v}"${v===current?' selected':''}>${esc(t)}</option>`).join('')}</select>`;
  }
  function quizFilters() {
    return `<div class="quiz-filters">${filterSelect('type','选择题型',[['all','全部题型'],...Object.entries(typeLabel)],ui.type)}${filterSelect('source','选择题目来源',[['all','全部来源'],['official','官方公开样题'],['custom','自编检查题']],ui.source)}${filterSelect('practice','练习范围',[['all','全部题目'],['unanswered','尚未练习'],['wrong','错题重练']],ui.practice)}${ui.related ? `<button class="link-btn" data-action="clear-related">仅练「${esc(cards.get(ui.related).title)}」 ×</button>`:''}</div>`;
  }
  function currentAttempt(q) { return retrying.has(q.id) ? null : progress.attempts[q.id]; }
  function selectedFor(q) { return selection.has(q.id) ? selection.get(q.id) : progress.attempts[q.id]?.selected || []; }
  function renderQuestion() {
    const pool = questionPool();
    $('#toolbar').innerHTML = `${topicSelect()}<span class="position">${pool.length ? '题目 '+position(Math.max(0,pool.findIndex(q=>q.id===ui.question)),pool.length) : '0 道题'}</span>`;
    if(!pool.length) { $('#workspace').innerHTML=quizFilters()+empty('这里暂时没有题目',ui.practice==='wrong'?'当前筛选下没有待重练的错题。可以切回全部题目继续学习。':'可以放宽主题、题型或来源筛选，再试一次。','清除题目筛选','clear-quiz-filters'); return; }
    let index=pool.findIndex(q=>q.id===ui.question); if(index<0){ index=0; ui.question=pool[0].id; }
    const q=questions.get(ui.question), attempt=currentAttempt(q), submitted=!!attempt, saved=progress.savedQuestions.includes(q.id);
    $('#toolbar .position').textContent='题目 '+position(index,pool.length);
    const stemHTML=q.stem.split('[[CODE]]').map((p,i)=> (i?`<pre class="code-block"><code>${esc(q.code||'')}</code></pre>`:'')+paragraphs(p)).join('');
    const long=q.type==='short' || q.stem.length>28;
    const heading=long?q.type==='short'?q.title:`${q.sourceLabel}`:q.stem;
    const body=long?`<div class="question-stem">${stemHTML}</div>`:'';
    const choices=q.type==='short'?`<label class="sr-only" for="short-answer">你的作答</label><textarea class="answer-text" id="short-answer" maxlength="20000" placeholder="先独立写出你的思路，再展开参考提纲。"${submitted?' readonly':''}>${esc(progress.drafts[q.id]||'')}</textarea><p class="draft-hint">${submitted?'这是你的作答记录；点“重新作答”可继续编辑。':'草稿保存在当前浏览器；不会调用 AI 自动评分。'}</p>`:renderOptions(q,attempt);
    $('#workspace').innerHTML=quizFilters()+`<article class="study-panel quiz-panel" aria-labelledby="question-title"><div class="panel-heading"><h1 id="question-title" class="question-title" tabindex="-1">${esc(heading)}</h1><button class="icon-btn bookmark${saved?' is-saved':''}" data-action="save-question" aria-label="${saved?'取消收藏':'收藏'}题目" aria-pressed="${saved}">${icon('bookmark')}</button></div><p class="question-meta">${esc(q.sourceLabel)} · ${typeLabel[q.type]}${q.points?' · 原卷 '+q.points+' 分':''}${q.disputed?' · '+esc(q.reviewLabel || '表述有歧义'):''}</p><div id="quiz-content" class="quiz-content reading-area" data-scroll-key="quiz/${q.id}" aria-label="题目与解析">${q.context?`<details class="question-context"><summary>阅读完整场景背景</summary><p>${esc(q.context)}</p></details>`:''}${body}${choices}${submitted?renderExplanation(q,attempt):''}</div><div class="panel-tools">${readerControls('quiz-content')}${sourceDetails(q,false)}</div></article><div class="action-row"><div class="answer-tools"><button class="text-btn" data-action="${submitted?'retry':'quiz-to-card'}">${submitted?'重新作答':'回看知识点'}</button>${submitted?'<button class="text-btn" data-action="show-explanation">查看解析</button>':''}</div><button class="primary-btn" data-action="${submitted?'next-question':'submit'}">${submitted?(index===pool.length-1?'完成这组练习':'下一题 →'):(q.type==='short'?'查看参考提纲':'提交答案')}</button></div>${deckNavigation(index,pool.length,'question')}<p class="footer-note">客观题按学习参考检查；简答题按要点自查，不等同官方评分。${q.disputed?' 本题不计入自动对错统计。':''}</p>`;
  }
  function renderOptions(q,attempt) {
    const chosen=selectedFor(q), submitted=!!attempt;
    return `<fieldset class="options" aria-label="${q.type==='multi'?'请选择所有符合的选项':'请选择一个答案'}"><legend class="sr-only">${q.type==='multi'?'多选：请选择所有符合的选项':'选择答案'}</legend>${q.options.map(o=>{
      const selected=chosen.includes(o.id), correct=q.answer.includes(o.id), judged=submitted&&!q.disputed;
      const state=judged&&correct?'is-correct':judged&&selected&&!correct?'is-wrong':selected?'is-selected':'';
      const stateText=judged&&correct?`${icon('check')}正确答案`:judged&&selected&&!correct?`${icon('cross')}你的选择 · 错误`:selected?'你的选择':'';
      return `<label class="answer-option ${state}"><input type="${q.type==='multi'?'checkbox':'radio'}" name="answer" value="${o.id}"${selected?' checked':''}${submitted?' disabled':''}><span class="option-letter">${q.type==='boolean'?'':o.id+'.'}</span><span class="option-copy">${esc(o.text)}</span>${stateText?`<span class="option-state">${stateText}</span>`:''}</label>`;
    }).join('')}</fieldset>`;
  }
  function renderExplanation(q,attempt) {
    const result=attempt.result;
    if(q.type==='short') {
      const checked=progress.rubrics[q.id]||[];
      return `<section class="explanation" aria-label="参考提纲与自查"><h2>参考提纲</h2>${paragraphs(q.explanation)}<div class="rubric" role="group" aria-label="逐项自查">${q.rubric.map((point,i)=>`<label><input type="checkbox" data-rubric="${i}"${checked.includes(i)?' checked':''}><span>${esc(point)}</span></label>`).join('')}</div><p class="draft-hint" id="rubric-count">已自查 ${checked.length} / ${q.rubric.length} 项，不是官方得分。</p><div class="self-assessment"><button class="secondary-btn" data-self="self-weak" aria-pressed="${result==='self-weak'}">需要再练</button><button class="secondary-btn" data-self="self-done" aria-pressed="${result==='self-done'}">基本完成</button></div>${relatedLinks(q)}</section>`;
    }
    const text=result==='review'?'本题仅提供参考选择':result==='correct'?'回答正确 · 学习参考':'再看一眼区别';
    const statusClass=result==='review'?'neutral':result==='correct'?'correct':'wrong';
    const answer=q.answer.map(id=>q.type==='boolean'?(id==='T'?'正确':'错误'):id).join('、');
    return `<section class="explanation" aria-label="答案与解析"><div class="feedback-status ${statusClass}">${result==='review'?'':icon(result==='correct'?'check':'cross')}${text}</div><h2>${q.disputed?'参考选择：':'参考答案：'}${esc(answer)}</h2>${paragraphs(q.explanation)}${q.caution?`<p class="caution">表述边界：${esc(q.caution)}</p>`:''}${relatedLinks(q)}</section>`;
  }
  function relatedLinks(q) { return `<div class="related-links">${q.related.map(id=>`<button class="link-btn" data-related-card="${id}">回看：${esc(cards.get(id).title)} →</button>`).join('')}</div>`; }
  function renderSaved() {
    $('#toolbar').innerHTML='';
    const tabs=[['cards','知识卡片'],['questions','收藏题目'],['mistakes','错题本'],['needs','待巩固']];
    const tab=ui.savedTab;
    let items=tab==='cards'?progress.savedCards.map(id=>cards.get(id)):tab==='questions'?progress.savedQuestions.map(id=>questions.get(id)):tab==='mistakes'?DATA.questions.filter(isWrong):DATA.cards.filter(c=>['weak','learning'].includes(progress.mastery[c.id]));
    const isCard=tab==='cards'||tab==='needs';
    const headings={cards:'把值得再看的，留在这里。',questions:'收藏的题目',mistakes:'回到还没弄懂的地方。',needs:'再理解一次。'};
    $('#workspace').innerHTML=`<div class="library-heading"><h1>${headings[tab]}</h1><span class="position">${items.length} ${isCard?'张':'道'}</span></div><nav class="sub-nav" aria-label="收藏与复习分类">${tabs.map(([id,t])=>`<button class="${tab===id?'active':''}" data-saved-tab="${id}" aria-pressed="${tab===id}">${t}</button>`).join('')}</nav>${items.length?`<ul class="result-list">${items.map(item=>`<li><button class="result-row" data-open-kind="${isCard?'cards':'quiz'}" data-open-id="${item.id}"><div><h3>${esc(item.title)}</h3><p>${esc(isCard?item.domain+' · '+(masteryLabel[progress.mastery[item.id]]||'未标记'):item.sourceLabel+' · '+typeLabel[item.type])}</p></div><span aria-hidden="true">→</span></button></li>`).join('')}</ul>`:empty(tab==='mistakes'?'还没有待重练的错题':tab==='needs'?'还没有标记待巩固的知识':'这里还没有收藏',tab==='mistakes'?'练习中答错的客观题、标记“需要再练”的简答题会出现在这里。争议题不自动判错。':tab==='needs'?'在卡片下方选择“还没理解”或“基本理解”，就能在这里回访。':'点击知识卡片或题目右上角的书签即可收藏。',isCard?'去读知识卡片':'开始练习',isCard?'all-cards':'all-questions')}`;
  }
  function toggleSaved(field,id) {
    const i=progress[field].indexOf(id); if(i<0) progress[field].push(id);else progress[field].splice(i,1);
    save();render();toast(i<0?'已收藏':'已取消收藏');
  }
  function goRelated() {
    const c=cards.get(ui.card); ui.related=c.id; ui.pinnedQuestion=null; ui.type='all';ui.source='all';ui.practice='all';ui.view='quiz';
    const candidate=questionPool()[0]; if(candidate)ui.question=candidate.id;
    setRoute(true);render();save();
  }
  function move(kind,step) {
    const pool=kind==='card'?cardPool():questionPool(), current=kind==='card'?ui.card:ui.question;
    const i=pool.findIndex(x=>x.id===current), next=pool[i+step];if(!next) {if(step>0 && kind==='question'){ui.pinnedQuestion=null;ui.view='saved';ui.savedTab='mistakes';render();save();toast('本组已到末尾。可以检查错题，或选择其他主题继续。');}return;}
    if(kind==='card'){ui.card=next.id;ui.tab='concept';}else {ui.question=next.id;ui.pinnedQuestion=null;}
    render();save();
  }
  function submit() {
    const q=questions.get(ui.question); if(!q)return;
    const chosen=selectedFor(q);
    if(q.type!=='short'&&!chosen.length){toast(q.type==='multi'?'请先选择至少一个选项。':'请先选择答案。');$('input[name=answer]')?.focus();return;}
    const old=progress.attempts[q.id], result=q.type==='short'||q.disputed?'review':equal(chosen,q.answer)?'correct':'wrong';
    progress.attempts[q.id]={selected:[...chosen],result,count:(old?.count||0)+1,wrongCount:(old?.wrongCount||0)+(result==='wrong'?1:0),at:new Date().toISOString()};
    ui.pinnedQuestion=q.id;retrying.delete(q.id);save();render();
    if(q.type==='short'&&!progress.drafts[q.id]?.trim())toast('已展开参考提纲；尚未独立作答，不会自动记为掌握。');
  }
  function stats() {
    const entries=Object.entries(progress.attempts), judged=entries.filter(([id])=>questions.get(id)?.type!=='short'&&!questions.get(id)?.disputed);
    const correct=judged.filter(([,v])=>v.result==='correct').length;
    return {seen:entries.length,correct,judged:judged.length,weak:DATA.questions.filter(isWrong).length,done:Object.values(progress.mastery).filter(x=>x==='done').length};
  }
  function openSettings() {
    const s=stats();
    $('#settings-content').innerHTML=`<p class="quiet-info">完整内容已内置，可断网学习。当前记录只保存在这台设备的此浏览器中；换浏览器或移动文件后，建议导入备份恢复。</p><section class="settings-section"><h3>你的学习记录</h3><div class="progress-line"><span>自评已掌握</span><strong>${s.done} / ${DATA.cards.length} 张</strong></div><div class="progress-line"><span>已练习</span><strong>${s.seen} / ${DATA.questions.length} 道</strong></div><div class="progress-line"><span>客观题学习检查</span><strong>${s.judged?`${s.correct} / ${s.judged} · ${Math.round(s.correct/s.judged*100)}%`:'尚未作答'}</strong></div><div class="progress-line"><span>待重练</span><strong>${s.weak} 道</strong></div><p class="quiet-info">正确率按每题最近一次非争议客观作答计算；不含主观题与歧义题，不是官方成绩或通过预测。</p><div class="settings-actions"><button class="secondary-btn" data-action="export">导出进度</button><button class="secondary-btn" data-action="import">导入并合并进度</button></div></section><section class="settings-section"><h3>内容与来源</h3><p>141 张知识卡片＝121 个大纲条目＋20 个补充考点。${DATA.questions.length} 道练习＝40 道公开样卷客观题＋18 个操作练习单元（覆盖原卷 8 个操作大项）＋${DATA.counts.custom} 道自编题。</p><p>公开样卷是模拟卷，不冒称历年正式真题。所有解析是学习参考；7 道表述存在歧义或前提待核的样题不自动计对错。简答题仅按要点自查。</p><p>${links([{label:'原始大纲',url:'41/41.pdf'},{label:'原始样卷',url:'41A1/41A.pdf'},{label:'配发 RLHF 论文',url:'41A2/素材/Training Language Models to Follow Instructions with Human Feedback.pdf'},{label:'外部资料采用记录',url:'docs/外部资料采用记录.md'}])}</p><p>${links([{label:'考试院大纲入口',url:'https://scite.shmeea.edu.cn/home/Syllabus'},{label:'考试院模拟卷入口',url:'https://scite.shmeea.edu.cn/home/TestPaper'}])}</p><p class="quiet-info">本地原文链接需将资料文件夹与本站保存在一起；单独复制 HTML 仍可学习全部卡片和题目，原文也可从上述官网查找。</p></section><section class="settings-section"><h3>考试说明</h3><p>适用于上海上信考“人工智能（四级）”代码 41，依据本地 2025 年版大纲及 2026 公开模拟卷。150 分、150 分钟；本次资料核查未取得明确的本届合格分数线。</p><p>大纲与样卷的题型分配存在差异。A 场样卷指定 E 文件名答题纸，与本地官方素材一致；正式场次、保存和提交按考场说明。本站无每日任务安排。</p></section><section class="settings-section"><h3>操作提示</h3><ul><li>选择复习专题，或从下拉框进入全部 13 个大纲领域。</li><li>卡片切换“概念、例子、易错点”；来源中保留大纲原条目。</li><li>← → 切卡；数字 1—4 或 A—D 选择客观题；Ctrl/⌘＋Enter 提交；Ctrl/⌘＋K 搜索。</li><li>简答题先写草稿，再看参考提纲；勾选自查后选择“需要再练”或“基本完成”。</li><li>备份导入只读取本地文件，不上传记录；合并收藏并按时间合并作答。</li></ul><div class="settings-actions"><button class="secondary-btn" data-action="print">打印当前内容</button></div></section><section class="settings-section danger-zone"><h3>清除本机记录</h3><p>将清除收藏、自评、草稿和作答记录。建议先导出备份。</p><button class="secondary-btn" data-action="reset">清除本机学习记录</button></section>`;
    const licenseSection=document.createElement('section');licenseSection.className='settings-section';
    licenseSection.innerHTML=`<h3>字体与开源许可</h3><p>中文无衬线字体基于 Noto Sans SC 裁剪并内嵌，离线阅读无需向第三方请求字体。示例训练流程按通用 API 整理，相关许可一并保留。</p><details><summary>字体许可 · SIL OFL 1.1</summary><pre class="font-license">${esc(DATA.fontLicense)}</pre></details><details><summary>PyTorch 教程许可 · BSD-3-Clause</summary><pre class="font-license">${esc(DATA.codeLicense)}</pre></details>`;
    $('#settings-content').append(licenseSection);
    $('#settings-dialog').showModal();prepareReaders();
  }
  function exportProgress() {
    save(); const blob=new Blob([JSON.stringify({app:'ai41-study',version:1,exportedAt:new Date().toISOString(),progress},null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download='AI41-学习进度-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('进度备份已生成。');
  }
  async function importProgress(file) {
    if(!file)return;
    try {
      if(file.size>3*1024*1024)throw Error('备份文件过大，请选择本站导出的进度文件。');
      const parsed=JSON.parse(await file.text());if(parsed.app!=='ai41-study'||parsed.version!==1)throw Error('这不是本站支持的进度备份。');
      const incoming=cleanProgress(parsed.progress);
      progress.savedCards=[...new Set([...progress.savedCards,...incoming.savedCards])];
      progress.savedQuestions=[...new Set([...progress.savedQuestions,...incoming.savedQuestions])];
      Object.assign(progress.mastery,incoming.mastery);
      for(const [id,v] of Object.entries(incoming.attempts)) if(!progress.attempts[id]||Date.parse(v.at)>=Date.parse(progress.attempts[id].at))progress.attempts[id]=v;
      for(const [id,v] of Object.entries(incoming.drafts))if(!progress.drafts[id])progress.drafts[id]=v;
      for(const [id,v] of Object.entries(incoming.rubrics))progress.rubrics[id]=[...new Set([...(progress.rubrics[id]||[]),...v])];
      selection.clear();retrying.clear();save();render();$('#settings-dialog').close();toast('已合并进度，现有收藏与较新的作答记录已保留。');
    } catch(error) { toast('导入未完成：'+error.message); }
    $('#import-file').value='';
  }
  function openSearch() { $('#search-dialog').showModal();$('#search-input').value='';renderSearch('');$('#search-input').focus({preventScroll:true});prepareReaders(); }
  function renderSearch(value) {
    $('#search-results').scrollTop=0;requestAnimationFrame(refreshReaders);
    const normalized=String(value).normalize('NFKC').trim().toLowerCase(), terms=normalized.split(/\s+/).filter(Boolean);
    if(!terms.length) { $('#search-results').innerHTML=`<p class="quiet-info">搜索全部 ${DATA.cards.length} 张卡片与 ${DATA.questions.length} 道题目。试试 RAG、Linux、KV Cache、反向传播。</p><ul class="result-list">`+['K080','K044','S09','S17','K118'].map(id=>`<li><button class="result-row" data-open-kind="cards" data-open-id="${id}"><div><h3>${esc(cards.get(id).title)}</h3><p>${esc(cards.get(id).summary)}</p></div><span>→</span></button></li>`).join('')+'</ul>';return; }
    const found=[];
    for(const c of DATA.cards) if(terms.every(t=>`${c.title} ${c.point} ${c.domain} ${c.summary} ${c.concept} ${c.example} ${c.pitfall} ${c.aliases||''}`.normalize('NFKC').toLowerCase().includes(t)))found.push({kind:'cards',item:c});
    for(const q of DATA.questions) if(terms.every(t=>`${q.title} ${q.stem} ${q.sourceLabel}`.normalize('NFKC').toLowerCase().includes(t)))found.push({kind:'quiz',item:q});
    $('#search-results').innerHTML=`<p class="quiet-info">找到 ${found.length} 条结果。</p>`+(found.length?`<ul class="result-list">${found.map(({kind,item})=>`<li><button class="result-row" data-open-kind="${kind}" data-open-id="${item.id}"><div><h3>${esc(item.title)}</h3><p>${esc(kind==='cards'?'知识卡片 · '+item.domain:item.sourceLabel+' · '+typeLabel[item.type])}</p></div><span>→</span></button></li>`).join('')}</ul>`:'<p class="quiet-info">没有匹配项。可以换用中文名称、英文缩写，或减少关键词。</p>');
  }
  document.addEventListener('click',event=>{
    const close=event.target.closest('[data-close]');if(close){document.getElementById(close.dataset.close).close();return;}
    const open=event.target.closest('[data-open-id]');if(open){if($('#search-dialog').open)$('#search-dialog').close();showItem(open.dataset.openKind,open.dataset.openId);return;}
    const nav=event.target.closest('[data-nav]');if(nav){ui.view=nav.dataset.nav;ui.returnTo=null;if(ui.view==='quiz'){ui.related=null;ui.type='all';ui.source='all';ui.practice='all';}setRoute(true);render();save();return;}
    const tab=event.target.closest('[data-tab]');if(tab){ui.tab=tab.dataset.tab;render();$('#tab-'+ui.tab)?.focus({preventScroll:true});return;}
    const savedTab=event.target.closest('[data-saved-tab]');if(savedTab){ui.savedTab=savedTab.dataset.savedTab;render();save();return;}
    const mark=event.target.closest('[data-mastery]');if(mark){if(mark.dataset.mastery==='clear')delete progress.mastery[ui.card];else progress.mastery[ui.card]=mark.dataset.mastery;save();render();toast(mark.dataset.mastery==='clear'?'已清除掌握标记':'已标记：'+masteryLabel[mark.dataset.mastery]);return;}
    const related=event.target.closest('[data-related-card]');if(related){const returnId=ui.question;ui.view='cards';ui.card=related.dataset.relatedCard;ui.topic=cards.get(ui.card).topic;ui.tab='concept';ui.returnTo=returnId;setRoute(true);render();save();return;}
    const self=event.target.closest('[data-self]');if(self){const a=progress.attempts[ui.question];if(a){a.result=self.dataset.self;a.at=new Date().toISOString();save();render();toast(a.result==='self-weak'?'已加入错题本，可稍后重练。':'已记录自查完成，不计入客观正确率。');}return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(!action){if(!event.target.closest('.mastery-wrap')){const menu=$('#mastery-menu');if(menu){menu.hidden=true;$('.mastery')?.setAttribute('aria-expanded','false');}}return;}
    if(action==='reading-prev'||action==='reading-next')pageReading(event.target.closest('[data-reading-target]').dataset.readingTarget,action==='reading-next'?1:-1);
    else if(action==='card-sources'||action==='question-sources')openSources(action==='card-sources');
    else if(action==='show-explanation'){const area=$('#quiz-content'),section=$('.explanation');if(area&&section){area.scrollTop=section.getBoundingClientRect().top-area.getBoundingClientRect().top+area.scrollTop;refreshReader(area);}}
    else if(action==='search')openSearch();else if(action==='settings')openSettings();
    else if(action==='save-card')toggleSaved('savedCards',ui.card);else if(action==='save-question')toggleSaved('savedQuestions',ui.question);
    else if(action==='mastery-menu'){const menu=$('#mastery-menu');menu.hidden=!menu.hidden;$('.mastery').setAttribute('aria-expanded',String(!menu.hidden));}
    else if(action==='related')goRelated();else if(action==='submit')submit();
    else if(action==='retry'){retrying.add(ui.question);selection.set(ui.question,[]);render();$('#short-answer')?.focus({preventScroll:true});}
    else if(action==='next-card')move('card',1);else if(action==='prev-card')move('card',-1);
    else if(action==='next-question')move('question',1);else if(action==='prev-question')move('question',-1);
    else if(action==='random-card'){const pool=cardPool();const other=pool.filter(c=>c.id!==ui.card);if(other.length){ui.card=other[Math.floor(Math.random()*other.length)].id;ui.tab='concept';render();save();}}
    else if(action==='all-cards'){ui.view='cards';ui.topic='all';render();save();}
    else if(action==='all-questions'||action==='clear-quiz-filters'){ui.view='quiz';ui.topic='all';ui.type='all';ui.source='all';ui.practice='all';ui.related=null;render();save();}
    else if(action==='clear-related'){ui.related=null;render();save();}
    else if(action==='quiz-to-card'){const q=questions.get(ui.question);if(q){ui.returnTo=ui.question;ui.card=q.related[0];ui.topic=cards.get(ui.card).topic;ui.tab='concept';ui.view='cards';render();save();}}
    else if(action==='return-quiz'){ui.question=ui.returnTo;ui.returnTo=null;ui.view='quiz';ui.topic='all';ui.type='all';ui.source='all';ui.practice='all';ui.related=null;render();save();}
    else if(action==='export')exportProgress();else if(action==='import')$('#import-file').click();
    else if(action==='print'){$('#settings-dialog').close();window.print();}
    else if(action==='reset'&&window.confirm('清除这台浏览器中的收藏、掌握标记、草稿和作答？\n此操作不影响已经导出的备份。')){progress=fresh();selection.clear();retrying.clear();Object.assign(ui,{view:'cards',card:'K080',question:'Q-RAG',topic:'rag',tab:'concept',related:null,returnTo:null});save();$('#settings-dialog').close();render();toast('已清除本机记录。');}
  });
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target.id==='topic-select'){ui.topic=target.value;ui.related=null;ui.returnTo=null;ui.pinnedQuestion=null;ui.tab='concept';render();save();}
    else if(target.dataset.filter){ui[target.dataset.filter]=target.value;ui.pinnedQuestion=null;render();save();}
    else if(target.name==='answer'){
      const q=questions.get(ui.question);if(currentAttempt(q))return;
      const chosen=[...document.querySelectorAll('input[name=answer]:checked')].map(x=>x.value);selection.set(q.id,chosen);
      for(const option of document.querySelectorAll('.answer-option'))option.classList.toggle('is-selected',chosen.includes($('input',option).value));
    }else if(target.dataset.rubric!==undefined){const chosen=[...document.querySelectorAll('[data-rubric]:checked')].map(x=>Number(x.dataset.rubric));progress.rubrics[ui.question]=chosen;save();$('#rubric-count').textContent=`已自查 ${chosen.length} / ${questions.get(ui.question).rubric.length} 项，不是官方得分。`;}
    else if(target.id==='import-file')importProgress(target.files[0]);
  });
  let searchTimer;
  document.addEventListener('input',event=>{
    if(event.target.id==='search-input'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderSearch(event.target.value),100);}
    if(event.target.id==='short-answer'){progress.drafts[ui.question]=event.target.value;clearTimeout(draftTimer);draftTimer=setTimeout(save,250);}
  });
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!$('#search-dialog').open)openSearch();return;}
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&ui.view==='quiz'&&!document.querySelector('dialog[open]')){event.preventDefault();if(!currentAttempt(questions.get(ui.question)))submit();return;}
    if(document.querySelector('dialog[open]'))return;
    if(event.target.matches('[role=tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const all=['concept','example','pitfall'];let i=all.indexOf(ui.tab);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;ui.tab=all[i];render();$('#tab-'+ui.tab)?.focus({preventScroll:true});return;}
    if(event.target.closest('input,textarea,select,[contenteditable=true],button,a,summary'))return;
    if(ui.view==='cards'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();move('card',event.key==='ArrowRight'?1:-1);}
    if(ui.view==='quiz'&&!currentAttempt(questions.get(ui.question))){const key=event.key.toUpperCase(), index=/^[1-4]$/.test(key)?Number(key)-1:/^[A-D]$/.test(key)?key.charCodeAt(0)-65:-1;if(index>=0){const option=document.querySelectorAll('input[name=answer]')[index];if(option){event.preventDefault();option.click();}}}
  });
  function readHash() {
    const [view,id]=location.hash.replace(/^#/,'').split('/');
    if(view==='cards'&&cards.has(id)){ui.view='cards';ui.card=id;if(!matchesTopic(cards.get(id)))ui.topic=cards.get(id).topic;ui.tab='concept';}
    else if(view==='quiz'&&questions.has(id)){ui.view='quiz';ui.question=id;ui.topic='all';ui.related=null;ui.type='all';ui.source='all';ui.practice='all';}
    else if(view==='saved'){ui.view='saved';ui.savedTab=['cards','questions','mistakes','needs'].includes(id)?id:'cards';}
  }
  window.addEventListener('hashchange',()=>{readHash();render();save();});
  window.addEventListener('popstate',()=>{readHash();render();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
  window.addEventListener('pagehide',save);
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();showItem('cards','K080');});
  readHash();render();save();
})();
