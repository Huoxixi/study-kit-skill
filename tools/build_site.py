"""Build the offline study site from reviewed knowledge and the supplied sample paper."""
from pathlib import Path
import json, re, collections, base64

ROOT = Path(__file__).resolve().parents[1]
def read(path): return (ROOT/path).read_text(encoding='utf-8-sig')
def clean(text):
    text = re.sub(r'^===== PAGE \d+ =====\s*', '', text, flags=re.M)
    text = re.sub(r'^\s*第\s*\d+\s*页，\s*共\s*\d+\s*页\s*41（模拟卷）\s*$', '', text, flags=re.M)
    text = re.sub(r'请在答题纸作答！此处答题一律无效！', '', text)
    return text.strip()
def compact(text): return re.sub(r'\s+', '', text).strip()
def prose(text):
    return re.sub(r'\s+', ' ', text).strip()

rows = json.loads(read('content/syllabus.json'))
assert len(rows) == 121
domain_names = list(dict.fromkeys(r['domain'] for r in rows))
domains = [{'id':f'd{i+1:02}', 'label':name} for i,name in enumerate(domain_names)]
domain_ids = {d['label']:d['id'] for d in domains}
topics = [
 {'id':'rag','label':'RAG 与知识库'}, {'id':'serving','label':'推理与部署'},
 {'id':'agent','label':'Agent 与工具'}, {'id':'model','label':'训练与对齐'},
 {'id':'foundation','label':'数学、编程与算法'}, {'id':'vision','label':'计算机视觉'},
 {'id':'speech','label':'语音与语言'}, {'id':'industry','label':'行业应用'}, {'id':'ethics','label':'安全与伦理'}]
def topic_for(n):
    if n <= 7: return 'foundation'
    if n <= 43: return 'foundation'
    if n <= 53: return 'model'
    if n <= 61: return 'vision'
    if n <= 72: return 'speech'
    if n in [75,76,80]: return 'rag'
    if n in [85,86]: return 'serving'
    if n in [87,88]: return 'agent'
    if n <= 84: return 'model'
    if n <= 115: return 'industry'
    if n <= 117: return 'foundation'
    return 'ethics'

short_titles = {
 'K001':'人工智能是什么','K002':'人工智能的研究方向','K003':'人工智能的三种流派','K004':'智能计算系统','K005':'从任务识别 AI 场景','K006':'通用大模型工具','K007':'千学百科与集成大模型平台',
 'K008':'线性代数：向量与矩阵','K009':'微积分：导数、梯度与积分','K010':'概率与统计','K011':'计算思维','K012':'数学建模','K013':'Python 与 API 基础','K014':'算法与复杂度','K015':'操作系统基础','K016':'Linux 与日志管理',
 'K020':'机器学习算法','K021':'深度学习算法','K022':'优化算法','K023':'CPU、GPU 与资源','K025':'并行与异构计算','K026':'谓词逻辑','K027':'推理规则','K028':'确定与不确定推理','K029':'专家系统','K030':'知识图谱','K031':'本体与知识表示',
 'K032':'监督与无监督学习','K033':'数据预处理与特征工程','K034':'模型训练与数据划分','K035':'评估指标','K036':'线性回归与逻辑回归','K037':'决策树、KNN 与 SVM','K038':'K-Means 与层次聚类','K039':'Boosting 与随机森林','K040':'PCA 与线性判别分析','K041':'朴素贝叶斯','K042':'强化学习','K043':'价值函数与 Q 学习',
 'K044':'前向与反向传播','K045':'激活函数','K046':'损失函数','K047':'梯度下降','K048':'过拟合与欠拟合','K049':'正则化','K050':'Sequential 模型','K051':'卷积神经网络 CNN','K052':'RNN、LSTM 与 GRU','K053':'Transformer 的核心模块','K054':'图像特征与滤波','K055':'边缘与局部描述符','K056':'分类与分割','K057':'目标检测与识别',
 'K062':'语音的基础概念','K063':'语音采样、量化与预处理','K064':'时域、频域特征与 MFCC','K065':'语音建模方法','K066':'语音识别相关任务','K067':'文本转语音 TTS','K068':'分词、词性与实体识别','K069':'句法分析','K070':'n-gram 与 Word2Vec','K071':'句子与上下文建模','K072':'翻译、问答与信息抽取','K073':'扩散模型','K074':'生成对抗网络 GAN','K075':'多模态基础','K077':'分布式机器学习','K078':'联邦学习','K079':'预训练','K080':'检索增强生成','K081':'Transformer 的模型结构','K082':'深度学习框架与训练循环','K083':'RLHF 与奖励模型','K084':'预训练、微调、对齐与超参数','K085':'大模型推理部署','K086':'工具链与基础设施','K087':'智能体 Agent','K088':'具身智能',
 'K089':'智能社会','K090':'智能社会：数据与资源','K091':'新闻、治理与法律应用','K092':'智能交通','K093':'交通：数据与资源','K094':'自动驾驶与交通调度','K095':'智能医疗','K096':'医疗：数据与资源','K097':'医学影像与在线咨询','K098':'智能制造','K099':'制造：数据与资源','K100':'无人化工厂','K101':'智能创意','K102':'创意：数据与资源','K103':'数字人、图像与音视频生成','K104':'智能推荐','K105':'推荐：数据、模型与算力','K106':'购物与视频推荐','K107':'智慧教育','K108':'教育：数据与资源','K109':'AI 助教、助学、助研与助管','K110':'机器人基础','K111':'机器人：数据与资源','K112':'移动、协作与仓储机器人','K113':'AI4Science','K114':'科研：数据与验证','K115':'AI 驱动的科学应用','K118':'可信人工智能','K119':'伦理与安全挑战','K120':'人工智能伦理原则','K121':'负责任的 AI 系统'}

cards=[]
for line in read('content/cards.txt').splitlines():
    if not line.strip(): continue
    parts=line.split('|'); assert len(parts)==6,(parts[0],len(parts))
    ident,summary,concept,example,pitfall,assertion=parts
    row=next(r for r in rows if r['id']==ident)
    cards.append({**row,'title':short_titles.get(ident,row['point']), 'summary':summary,'concept':concept.replace('\\u007c','｜'),'example':example,'pitfall':pitfall,'assertion':assertion,'topic':topic_for(int(ident[1:])),'domainId':domain_ids[row['domain']],'kind':'syllabus'})
for line in read('content/supplements.txt').splitlines():
    if not line.strip():continue
    ident,title,topic,summary,concept,example,pitfall,assertion=line.split('|')
    domain='人工智能前沿技术与生成式大模型'
    if topic=='ethics':domain='人工智能安全与伦理'
    if ident=='S19':domain='人工智能概述'
    cards.append({'id':ident,'title':title,'point':title,'unit':'样卷细拆考点','level':'补充','page':5,'summary':summary,'concept':concept,'example':example,'pitfall':pitfall,'assertion':assertion,'topic':topic,'domainId':domain_ids[domain],'domain':domain,'kind':'supplement'})
assert len(cards)==141
card_by_id={c['id']:c for c in cards}
card_by_id['K080']['flow']=['检索资料','补充上下文','生成回答']
for ident,aliases in {'S05':'向量相似度 嵌入模型 embedding cosine 内积 归一化','S07':'混合检索 BM25 RRF','S09':'分页注意力 键值缓存 paged attention','S11':'speculative decoding 投机采样','S12':'首字延迟 首token时延 每token耗时 throughput','K083':'人类反馈强化学习 SFT RM PPO 奖励模型'}.items():card_by_id[ident]['aliases']=aliases

concept_refs={}
for line in read('content/concept-sources.txt').splitlines():
    if not line.strip() or line.startswith('#'): continue
    key,record,category,label,url,idents=line.split('|')
    assert key not in concept_refs,key
    assert url.startswith('https://'),key
    concept_refs[key]={'key':key,'record':record,'category':category,'label':label,'url':url,'cards':idents.split()}
    assert all(ident in card_by_id for ident in idents.split()),key
for c in cards:
    c['conceptSources']=[{k:v for k,v in ref.items() if k!='cards'} for ref in concept_refs.values() if c['id'] in ref['cards']]
    c['conceptKind']='definition' if c['conceptSources'] else 'scope'
    if c['kind']=='syllabus':
        c['scopeSources']=[{'label':f"本地大纲 · PDF 第 {c['page']} 页",'url':f"41/41.pdf#page={c['page']}"},{'label':'考试院大纲入口','url':'https://scite.shmeea.edu.cn/home/Syllabus'}]
    else:
        c['scopeSources']=[{'label':'本地公开模拟卷','url':'41A1/41A.pdf'},{'label':'考试院模拟卷入口','url':'https://scite.shmeea.edu.cn/home/TestPaper'}]
    c['sources']=c['scopeSources']+c['conceptSources']
assert all(c['conceptSources'] for c in cards if c['kind']=='supplement')
for ident,note in {
    'K001':'OECD 文档定义的是 AI 系统；达特茅斯提案用于核对历史时间。',
    'K014':'NIST 条目用于算法的基本含义；复杂度部分为考纲要求下的通用释义。',
    'K088':'AIMA 用于感知、行动与环境的结构说明，不作为具身智能的统一定义。',
    'K007':'学校来源用于核对平台名称和公开入口；没有把规划中的功能或未登录查看的功能写成已经实测。',
    'K110':'IFR 来源用于核对一定程度自主性及机器人设备边界；没有声称读取 ISO 标准付费全文。',
    'S13':'RedisVL 来源用于语义缓存；模型路由部分为工程概述，不是该库的定义。',
    'S18':'CLIP 来源说明视觉与语言的对应学习，不表示所有 VLM 都采用 CLIP，也不证明其读图表不会出错。'
}.items(): card_by_id[ident]['sourceNote']=note

raw=read('content/sample-paper.txt')
paper=clean(raw)
answer_meta={}
for line in read('content/sample-answers.txt').splitlines():
    if not line:continue
    ident,answer,related,explanation,caution=line.split('|')
    answer_meta[ident]={'answer':list(answer) if answer not in ['T','F'] else [answer], 'related':related.split(','),'explanation':explanation,'caution':caution,'disputed':bool(caution)}

questions=[]
obj_sections=[('OC','single','一、单选题','二、多选题',15),('OM','multi','二、多选题','三、是非题',10),('OT','boolean','三、是非题','四、操作题',15)]
for prefix,qtype,start,end,count in obj_sections:
    section=paper.split(start,1)[1].split(end,1)[0]
    pieces=re.split(r'(?m)^\s*(\d+)\.',section)
    assert (len(pieces)-1)//2==count,(prefix,len(pieces))
    for i in range(1,len(pieces),2):
        n=int(pieces[i]);chunk=pieces[i+1].strip();ident=f'{prefix}{n:02}'
        options=[]
        if qtype!='boolean':
            markers=list(re.finditer(r'(?m)^\s*([ABCD])[.、]',chunk));assert len(markers)==4,(ident,markers)
            stem=prose(chunk[:markers[0].start()])
            for j,m in enumerate(markers):
                stop=markers[j+1].start() if j+1<len(markers) else len(chunk)
                options.append({'id':m.group(1),'text':prose(chunk[m.end():stop])})
        else:
            stem=prose(chunk);options=[{'id':'T','text':'正确'},{'id':'F','text':'错误'}]
        page=1 if prefix=='OC' and n<=5 else 2 if prefix=='OC' and n<=11 else 3 if prefix=='OC' else 3 if prefix=='OM' and n<=3 else 4 if prefix=='OM' and n<=9 else 5 if prefix=='OM' else 5 if n<=13 else 6
        q={'id':ident,'type':qtype,'source':'official','sourceLabel':f"2026 模拟卷 · {'单选' if prefix=='OC' else '多选' if prefix=='OM' else '判断'}{n}",'title':stem,'stem':stem,'options':options,'points':2 if qtype=='multi' else 1,'page':page,**answer_meta[ident]}
        questions.append(q)

subjective_meta={}
for line in read('content/subjective-answers.txt').splitlines():
    if not line:continue
    ident,title,related,explanation,rubric=line.split('|')
    subjective_meta[ident]={'title':title,'related':related.split(','),'explanation':explanation.replace('~','\n\n'),'rubric':rubric.split('~')}

train_code='''model.train()
optimizer = torch.optim.SGD(model.parameters(), lr=1e-3)
for images, labels in train_loader:
    # 模拟随机增强
    images = torchvision.transforms.RandomHorizontalFlip(p=0.5)(images)
    # 梯度清零
    ______①______
    outputs = model(images)
    loss = torch.nn.functional.cross_entropy(outputs, labels)
    # 反向传播、梯度计算
    ______②______
    # 参数更新
    ______③______'''
api_code='''import requests
url = "https://api.example.com/v1/image/classify"
headers = {"Authorization": "Bearer your_api_key"}
files = {"image": open("river.jpg", "rb")}
data = {"model": "river-object-v1"}
response = requests.post(
    url, files=_____①_____, data=_____②_____, headers=_____③_____
)
print(response.json()["result"]["label"])'''

def add_subject(ident,stem,page,points,context='',code=None,parent=''):
    q={'id':ident,'type':'short','source':'official','sourceLabel':'2026 模拟卷 · '+subjective_meta[ident]['title'].split(' · ')[0], 'stem':stem.strip(),'context':context.strip(),'points':points,'page':page,'parent':parent, **subjective_meta[ident]}
    if code:q['code']=code
    questions.append(q)

operation=paper.split('四、操作题',1)[1]
base,practice=operation.split('（二）实践应用题',1)
base_parts=re.split(r'(?m)^\s*([1-5])\.',base)
assert (len(base_parts)-1)//2==5
for i in range(1,len(base_parts),2):
    n=int(base_parts[i]);stem=base_parts[i+1].strip();code=None
    if n==4:
        a=stem.index('model.train()');stem=prose(stem[:a])+'\n\n[[CODE]]';code=train_code
    elif n==5:
        a=stem.index('import requests');b=stem.index('print(response.json()',a);b=stem.index('\n',b) if '\n' in stem[b:] else len(stem)
        stem=prose(stem[:a])+'\n\n[[CODE]]\n\n'+prose(stem[b:]);code=api_code
    else:stem=prose(stem)
    add_subject(f'OB{n}',stem,6,15 if n==5 else 5,code=code,parent=f'基础{n}')

groups=re.split(r'(?m)^\s*([1-3])\.',practice)
assert (len(groups)-1)//2==3
general_context=prose(groups[0].split('上海正加快',1)[1])
general_context='上海正加快'+general_context
for i in range(1,len(groups),2):
    n=int(groups[i]);chunk=groups[i+1];parts=re.split(r'\n\s*（([1-4])）',chunk)
    context=general_context+'\n\n'+prose(parts[0])
    if n in [1,2]:
        assert (len(parts)-1)//2==(3 if n==1 else 4)
        for j in range(1,len(parts),2):
            sub=int(parts[j]);add_subject(f'OP{n}{sub}',prose(parts[j+1]),8 if n==1 else 9,5,context,parent=f'实践{n}')
    else:
        assert (len(parts)-1)//2==3
        for j in range(1,len(parts),2):
            sub=int(parts[j]);pair=re.split('[①②]',parts[j+1]);assert len(pair)==3,(sub,len(pair))
            for k,suffix in [(1,'A'),(2,'B')]:
                add_subject(f'OP3{sub}{suffix}',prose(pair[k]),11 if sub==3 and suffix=='B' else 10,5,context+'\n\n'+prose(pair[0]),parent='实践3')
assert sum(q['source']=='official' for q in questions)==58
assert sum(q['points'] for q in questions if q['type']=='short')==100

for c in cards:
    assertion=c['assertion']
    # Each statement was authored separately: correct ones are not inferred from wording.
    true_ids={'K002','K004','K010','K011','K018','K021','K023','K026','K029','K031','K033','K036','K039','K041','K043','K046','K048','K051','K056','K058','K062','K064','K066','K068','K072','K073','K075','K078','K084','K087','K090','K093','K097','K099','K103','K105','K107','K110','K111','K113','K116','K119','K121','S03','S05','S10','S18','S20'}
    true_ids.difference_update({'K004','K010'})
    true_ids.update({'K005','K007','K009','K014'})
    ident='CQ-'+c['id']
    questions.append({'id':ident,'type':'boolean','source':'custom','sourceLabel':'自编考点检查','title':assertion,'stem':assertion,'options':[{'id':'T','text':'正确'},{'id':'F','text':'错误'}],'answer':['T' if c['id'] in true_ids else 'F'],'related':[c['id']],'explanation':c['concept']+'\n\n'+c['pitfall'],'caution':'','disputed':False})
    c.pop('assertion')

demo={'id':'Q-RAG','type':'single','source':'custom','sourceLabel':'自编练习','title':'RAG 通常如何让回答更有依据？','stem':'RAG 通常如何让回答更有依据？','options':[{'id':'A','text':'通过重新训练全部模型参数'},{'id':'B','text':'检索相关资料，补充模型上下文'},{'id':'C','text':'自动扩大模型的参数规模'},{'id':'D','text':'不使用任何外部信息'}],'answer':['B'],'related':['K080','S04'],'explanation':'RAG 把检索到的资料加入上下文，通常不需要更新模型权重。微调则通过训练调整参数；两者可以结合，但不是同一个步骤。','caution':'','disputed':False}
questions.insert(0,demo)
audit_questions=json.loads(read('content/audit-questions.json'))
assert len(audit_questions)==12
for extra in audit_questions:
    questions.append({**extra,'title':extra['stem'],'source':'custom','sourceLabel':'自编辨析与计算','caution':'','disputed':False})
assert len(questions)==212
for q in questions:
    assert q.get('title') and q.get('stem')
    assert q['related'] and all(x in card_by_id for x in q['related']),q['id']
    q['topics']=list(dict.fromkeys(card_by_id[x]['topic'] for x in q['related']))
    q['domains']=list(dict.fromkeys(card_by_id[x]['domainId'] for x in q['related']))
    if q['source']=='official':
        q['sources']=[{'label':f"本地模拟卷 · 第 {q['page']} 页",'url':f"41A1/41A.pdf#page={q['page']}"},{'label':'考试院模拟卷入口','url':'https://scite.shmeea.edu.cn/home/TestPaper'}]
    else:q['sources']=list({s['url']:s for ident in q['related'] for s in card_by_id[ident]['sources']}.values())
    if q['source']=='official':
        q['analysisSources']=list({s['url']:s for ident in q['related'] for s in card_by_id[ident]['conceptSources']}.values())
        if q['id']=='OT12':
            q['analysisSources'].append({'label':'国投集团 · 60天径流预见期的公开口径','url':'https://www.sdicc.com.cn/xxgl/toXinXiDetail?guid=82413555-e54c-4e7d-aa39-45b3709ab2bc'})
        if q['id']=='OM08':
            q['analysisSources'].append({'label':'Guo 等 · 概率校准的定义与检验','url':'https://proceedings.mlr.press/v70/guo17a.html'})
    if q.get('disputed'):q['reviewLabel']='数据口径待核' if q['id']=='OT12' else '表述有歧义'
    if q['type']!='short': assert all(a in [o['id'] for o in q['options']] for a in q['answer'])
for c in cards:
    c['relatedQuestions']=[q['id'] for q in questions if c['id'] in q['related']]
    assert c['relatedQuestions']

data={'version':1,'updated':'2026-11-15','cards':cards,'questions':questions,'topics':topics,'domains':domains,'fontLicense':read('assets/fonts/OFL.txt') if (ROOT/'assets/fonts/OFL.txt').exists() else '', 'codeLicense':read('docs/sources/PyTorch-tutorials-LICENSE.txt'),'counts':{'cards':len(cards),'syllabus':121,'supplements':20,'questions':len(questions),'officialObjective':40,'officialSubjective':18,'officialParents':8,'custom':sum(q['source']=='custom' for q in questions)}}
(ROOT/'web').mkdir(exist_ok=True)
(ROOT/'web/data.js').write_text('window.AI41_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ROOT/'content/site-data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
assert len(set(c['id'] for c in cards))==len(cards)
assert len(set(q['id'] for q in questions))==len(questions)
report={'counts':data['counts'],'domains':dict(collections.Counter(c['domain'] for c in cards if c['kind']=='syllabus')),'types':dict(collections.Counter(q['type'] for q in questions)),'disputed':[q['id'] for q in questions if q.get('disputed')],'subjectivePoints':100}
(ROOT/'docs/网站内容覆盖报告.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if (ROOT/'web/app.js').exists():
    font_path=ROOT/'assets/fonts/ai41-study.woff2'
    font_css=''
    if font_path.exists():
        encoded=base64.b64encode(font_path.read_bytes()).decode('ascii')
        font_css="@font-face{font-family:'AI41Study Sans';src:url(data:font/woff2;base64,"+encoded+") format('woff2');font-weight:100 900;font-style:normal;font-display:swap;}\n"
    html=read('web/template.html').replace('/* STYLES */',font_css+read('web/styles.css')+'\n'+read('web/viewport.css')).replace('/* DATA */',read('web/data.js').replace('</script','<\\/script')).replace('/* APP */',read('web/app.js').replace('</script','<\\/script'))
    (ROOT/'index.html').write_text(html,encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
