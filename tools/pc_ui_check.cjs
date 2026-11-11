/* PC UIの前後比較。独立Chrome、ローカル応答、全APIモックで実記録に触らない。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'), phase=process.argv[2]||'after';
const scope=process.env.PC_CHECK_SCOPE||'all';
if(!['before','after'].includes(phase))throw Error('before / after を指定してください');
const base='http://ot-trainer.test/app/',out=path.join(root,'docs/PC_UI確認',phase),baseline=path.join(root,'docs/PC_UI確認/.baseline/app');
fs.mkdirSync(out,{recursive:true});
const reportName=scope==='all'?'report.json':`report-${scope}.json`;
const report={phase,scope,baselineCommit:'f44f310',startedAt:new Date().toISOString(),checks:[],screens:[],screenshots:[],errors:[],consoleErrors:[],apiWrites:0};
const glossary=JSON.parse(fs.readFileSync(path.join(root,'content/glossary/glossary.json'),'utf8'));
const longestTerm=Object.keys(glossary).filter(word=>glossary[word].意味&&glossary[word].読み&&!glossary[word].flag).sort((a,b)=>b.length-a.length)[0];
const termStorageKey='ot-term-drill-v1',examStorageKey='ot-exam-progress-v1';
let browser,debugPage;
function check(name,value,detail){report.checks.push({name,pass:!!value,...(detail===undefined?{}:{detail})});assert.ok(value,name+(detail===undefined?'':': '+JSON.stringify(detail)));}
async function contextFor(width,height,colorScheme='light'){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,deviceScaleFactor:1,locale:'ja-JP',serviceWorkers:'block',colorScheme});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
    if(url.pathname.startsWith('/api/')){if(route.request().method()!=='GET')report.apiWrites++;return route.fulfill({json:{}});}
    const decoded=decodeURIComponent(url.pathname),relative=decoded+(decoded.endsWith('/')?'index.html':'');
    const file=phase==='before'&&relative.startsWith('/app/')?path.resolve(baseline,'.'+relative.slice(4)):path.resolve(root,'.'+relative);
    const allowed=file.startsWith(root+path.sep);
    if(!allowed)return route.fulfill({status:404,body:'not found'});
    const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
      // 生ソースの複製はGitへ提出しない。再実行時は同じ基点のGitオブジェクトから読む。
      if(phase==='before'&&relative.startsWith('/app/'))try{
        const body=execFileSync('git',['show','f44f310:'+relative.slice(1)],{cwd:root,maxBuffer:8*1024*1024});
        return route.fulfill({body,contentType:mime[path.extname(file)]||'application/octet-stream'});
      }catch{}
      return route.fulfill({status:404,body:'not found'});
    }
    return route.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'});
  });return context;
}
function watch(page){debugPage=page;page.on('pageerror',e=>report.errors.push({url:page.url(),message:e.message}));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({url:page.url(),message:m.text()});});}
async function mainReady(page){await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>typeof Q!=='undefined'&&Q.length&&document.getElementById('rangeCard'));}
async function termReady(page){await page.goto(base+'term-drill.html',{waitUntil:'load'});await page.waitForFunction(()=>!document.getElementById('start-practice').disabled);}
async function startTerm(page){await page.locator('#practice-subject').selectOption('生理学');await page.locator('#practice-count').selectOption('5');await page.locator('#practice-order').selectOption('fixed');await page.locator('#start-practice').click();}
function circadian(page){return page.getByRole('option').filter({has:page.locator('.option-label',{hasText:/^概日リズム$/})});}
async function metrics(page){return page.evaluate(()=>{
  const visible=element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
  const rect=element=>{const r=element.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};};
  const selectors=['#start-practice','#submit-answer','#give-up','#next-question','button[onclick="submitQ()"]','button[onclick="nextQ()"]','a[href="term-drill.html"]'];
  const actions=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(visible).map(element=>{
    const r=element.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;
    const inViewport=r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;
    const hit=cx>=0&&cx<innerWidth&&cy>=0&&cy<innerHeight?document.elementFromPoint(cx,cy):null;
    return {selector,text:element.textContent.trim(),...rect(element),disabled:element.disabled,inViewport,uncovered:!!hit&&(hit===element||element.contains(hit))};
  }));
  const outside=[...document.querySelectorAll('body *')].filter(visible).filter(element=>{
    const r=element.getBoundingClientRect();if(r.left>=-1&&r.right<=innerWidth+1)return false;
    for(let p=element.parentElement;p&&p!==document.body;p=p.parentElement)if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return false;
    return true;
  }).slice(0,12).map(element=>({tag:element.tagName,cls:String(element.className).slice(0,80),...rect(element)}));
  return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,actions,outside};
});}
async function shot(page,label,width,height,colorScheme='light'){
  await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
  const name=`${width}x${height}-${colorScheme}-${label}`;const measure=await metrics(page);report.screens.push({label,colorScheme,...measure});
  await page.screenshot({path:path.join(out,name+'.png')});await page.screenshot({path:path.join(out,name+'-full.png'),fullPage:true});
  report.screenshots.push(name+'.png',name+'-full.png');
  if(phase==='after')check(name+' 横はみ出しなし',!measure.overflow,measure);
  return measure;
}
function visibleAction(measure,selector,name){
  const action=measure.actions.find(item=>item.selector===selector);
  check(name+' 主操作を画面内で視認',!!action&&action.inViewport&&action.uncovered,action);
}
async function primaryScreens(width,height,colorScheme='light'){
  const context=await contextFor(width,height,colorScheme),page=await context.newPage();watch(page);
  await mainReady(page);await shot(page,'home',width,height,colorScheme);
  await page.evaluate(()=>startList(['50-am-003'],'range'));const quiz=await shot(page,'quiz',width,height,colorScheme);
  if(phase==='after'&&width>=1024)visibleAction(quiz,'button[onclick="submitQ()"]',width+' 過去問未解答');
  await page.locator('.choice[data-n="1"]').click();await page.locator('button[onclick="submitQ()"]').click();
  check(width+' 過去問の誤答採点と誤り理由',(await page.locator('.verdict').innerText()).includes('不正解')&&await page.locator('.why').count()>0);
  const quizFeedback=await shot(page,'quiz-feedback',width,height,colorScheme);
  if(phase==='after'&&width>=1024)visibleAction(quizFeedback,'button[onclick="nextQ()"]',width+' 過去問採点後');
  await page.locator('button[onclick="nextQ()"]').click();check(width+' 過去問の結果画面',(await page.locator('#app').innerText()).includes('結果'));
  const existingExam=await page.evaluate(key=>localStorage.getItem(key),examStorageKey);
  await termReady(page);const setup=await shot(page,'term-setup',width,height,colorScheme);
  if(phase==='after'&&width>=1024)visibleAction(setup,'#start-practice',width+' 用語練習メニュー');
  await startTerm(page);
  if(phase==='after'){
    const focus=await page.evaluate(()=>({id:document.activeElement?.id,desktop:matchMedia('(min-width:1024px) and (pointer:fine)').matches}));
    check(width+' 開始時focusは端末に応じる',focus.desktop?focus.id==='answer-input':focus.id!=='answer-input',focus);
  }
  await page.locator('#answer-input').fill('がいじつ');await circadian(page).waitFor();
  const candidates=await shot(page,'term-candidates',width,height,colorScheme);
  if(phase==='after'&&width>=1024)visibleAction(candidates,'#submit-answer',width+' 用語候補表示');
  await circadian(page).click();await page.locator('#submit-answer').click();
  check(width+' 用語入力採点',await page.locator('#verdict.correct').count()===1);
  const termFeedback=await shot(page,'term-feedback',width,height,colorScheme);
  if(phase==='after'&&width>=1024){
    visibleAction(termFeedback,'#next-question',width+' 用語採点後');
    const boxes=await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {q:rect('question-screen'),f:rect('feedback')};});
    check(width+' 問題と解説の重なりなし',boxes.q.right<=boxes.f.left+1||boxes.f.right<=boxes.q.left+1||boxes.q.bottom<=boxes.f.top+1||boxes.f.bottom<=boxes.q.top+1,boxes);
  }
  check(width+' 用語練習で過去問の記録を維持',await page.evaluate(key=>localStorage.getItem(key),examStorageKey)===existingExam);
  await context.close();
}
async function keyboardChecks(){
  const context=await contextFor(1280,720),page=await context.newPage();watch(page);await termReady(page);await startTerm(page);
  await page.locator('#answer-input').fill('がいじつ');await page.keyboard.press('ArrowDown');
  check('PC下キーで候補を選択中',await page.locator('#answer-input').getAttribute('aria-activedescendant')==='term-option-0');
  await page.keyboard.press('Enter');check('PC Enter1回は候補確定だけ',await page.locator('#submit-answer').isEnabled()&&await page.locator('#feedback').isHidden());
  await page.keyboard.press('Enter');check('PC Enter2回目で採点し見出しへfocus',await page.locator('#verdict.correct').isVisible()&&await page.evaluate(()=>document.activeElement.id)==='verdict');
  for(const fields of [{key:'Enter',repeat:true},{key:'Enter',isComposing:true,keyCode:229},{key:'Enter',ctrlKey:true},{key:'Enter',altKey:true},{key:'Enter',metaKey:true},{key:'Enter',shiftKey:true}]){
    await page.locator('#verdict').dispatchEvent('keydown',fields);
    check('PC採点後の誤操作Enterは次問へ進めない '+JSON.stringify(fields),(await page.locator('#question-count').innerText())==='1 / 5');
  }
  await page.locator('#feedback summary').focus();await page.keyboard.press('Enter');
  check('summaryのEnterは出典を開き次問へ進めない',await page.locator('#feedback details').getAttribute('open')!==null&&(await page.locator('#question-count').innerText())==='1 / 5');
  await page.locator('#feedback a').first().focus();await page.locator('#feedback a').first().dispatchEvent('keydown',{key:'Enter'});
  check('リンク上のEnterを次問に横取りしない',(await page.locator('#question-count').innerText())==='1 / 5');
  await page.locator('#verdict').focus();await page.keyboard.press('Enter');
  check('PC採点後Enterで次問と入力focus',(await page.locator('#question-count').innerText())==='2 / 5'&&await page.evaluate(()=>document.activeElement.id)==='answer-input');
  await page.locator('#give-up').click();await page.locator('#next-question').focus();await page.keyboard.press('Enter');
  check('次問ボタンのEnterは1問だけ進む',(await page.locator('#question-count').innerText())==='3 / 5');
  await page.locator('#answer-input').fill('し');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  check('PC下キー2回目で次候補',await page.locator('#answer-input').getAttribute('aria-activedescendant')==='term-option-1');
  await page.keyboard.press('ArrowUp');check('PC上キーで前の候補',await page.locator('#answer-input').getAttribute('aria-activedescendant')==='term-option-0');
  await page.keyboard.press('Escape');check('PC Escapeは候補だけを閉じる',await page.locator('#answer-options').isHidden()&&(await page.locator('#question-count').innerText())==='3 / 5');
  await page.goto(base+'term-drill.html?demo=1',{waitUntil:'load'});await page.waitForFunction(()=>!document.getElementById('answer-input').disabled);
  await page.locator('#answer-input').fill('がいじつ');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  check('例題の採点後Enterで同じ問題を再試行',await page.locator('#feedback').isHidden()&&await page.locator('#answer-input').inputValue()===''&&(await page.locator('#question-count').innerText())==='例題 1 / 1');
  await context.close();
}
async function extendedLayoutChecks(){
  for(const [width,height]of[[1280,720],[390,844]]){
    const context=await contextFor(width,height),page=await context.newPage();watch(page);await termReady(page);await startTerm(page);
    await page.locator('#answer-input').fill('し');check(width+' 広い読みで候補8件',await page.locator('#answer-options .option').count()===8);
    const rows=await page.locator('#answer-options .option').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};}));
    check(width+' 候補8件のタップ領域',rows.every(row=>row.height>=44&&row.width>=44),rows);
    const eight=await shot(page,'term-eight-candidates',width,height);if(width>=1024)visibleAction(eight,'#submit-answer',width+' 候補8件');
    for(let i=0;i<8;i++)await page.locator('#answer-input').press('ArrowDown');
    const last=await page.evaluate(()=>{const list=document.getElementById('answer-options'),row=document.getElementById('term-option-7'),lr=list.getBoundingClientRect(),rr=row.getBoundingClientRect();return {active:document.getElementById('answer-input').getAttribute('aria-activedescendant'),scrollTop:list.scrollTop,rowTop:rr.top,rowBottom:rr.bottom,listTop:lr.top,listBottom:lr.bottom};});
    check(width+' 下キーで8件目まで候補内スクロール',last.active==='term-option-7'&&last.scrollTop>0&&last.rowTop>=last.listTop&&last.rowBottom<=last.listBottom+1,last);
    await page.locator('#answer-input').fill(longestTerm);
    await page.locator('#answer-options .option-label').filter({hasText:longestTerm}).waitFor();
    const long=await shot(page,'term-long-candidate',width,height);if(width>=1024)visibleAction(long,'#submit-answer',width+' 長い用語候補');
    await context.close();
  }
}
async function savedProgressChecks(){
  const context=await contextFor(1280,720),page=await context.newPage();watch(page);
  await termReady(page);const deck=await page.evaluate(()=>window.TERM_DRILL_QUESTIONS);
  const oldActive={ids:deck.map(q=>q.id),index:1,results:[{id:deck[0].id,picked:deck[0].answer,ok:true,kind:'answer',t:1}],startedAt:1};
  const oldCompleted={ids:[deck[0].id],index:1,results:[{id:deck[0].id,picked:deck[0].answer,ok:true,kind:'answer',t:1}],startedAt:1,finishedAt:2};
  const saved={version:1,active:oldActive,history:[oldCompleted]};
  await page.evaluate(([key,value])=>localStorage.setItem(key,JSON.stringify(value)),[termStorageKey,saved]);await page.reload({waitUntil:'load'});
  await page.locator('#resume-practice').waitFor();
  check('PC UI更新後も旧20問の記録と履歴を維持',JSON.stringify(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),termStorageKey))===JSON.stringify(saved));
  check('PC再開案内に旧20問と回答数',(await page.locator('#resume-description').innerText()).includes('生理学 20問')&&(await page.locator('#resume-description').innerText()).includes('1問'));
  await page.locator('#resume-practice').click();check('PC旧記録の2問目を入力focusで再開',(await page.locator('#question-count').innerText())==='2 / 20'&&await page.evaluate(()=>document.activeElement.id)==='answer-input');
  await page.locator('#answer-input').fill('こうじょうせい');await page.locator('#answer-options .option-label').filter({hasText:/^恒常性$/}).click();await page.locator('#submit-answer').click();
  const updated=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),termStorageKey);
  check('PC UIから旧記録へ採点追加し履歴は保持',updated.active.results.length===2&&updated.active.results[1].ok&&JSON.stringify(updated.history)===JSON.stringify(saved.history));
  await page.locator('#pause-practice').click();await page.locator('#start-practice').click();
  check('PC UIで新セッション開始後も旧完了履歴を保持',JSON.stringify((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),termStorageKey)).history)===JSON.stringify(saved.history));
  await context.close();
}
async function integrationChecks(){
  report.integrationBase='46acfda';report.integrationHead=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  for(const [width,height]of[[1024,768],[1280,720],[1440,900],[1920,1080],[360,844],[390,844],[412,844]]){
    const context=await contextFor(width,height),page=await context.newPage();watch(page);await mainReady(page);
    const hrefs=await page.locator('.appbar .tabs a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
    check(width+' 統合後の5タブを維持',JSON.stringify(hrefs)===JSON.stringify(['index.html','graph.html','sakuin.html','kotoba.html','ami.html']),hrefs);
    const home=await metrics(page);report.screens.push({label:'integration-home',...home});
    check(width+' 統合後ホームの全体横はみ出しなし',!home.overflow,home);
    if([1280,1440].includes(width))await shot(page,'home',width,height);
    if(width<600){
      await page.locator('.appbar .tabs').evaluate(element=>{element.scrollLeft=element.scrollWidth;});
      const last=await page.locator('.appbar .tabs').evaluate(element=>{const link=element.querySelector('a[href="ami.html"]'),n=element.getBoundingClientRect(),r=link.getBoundingClientRect();return {clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,scrollLeft:element.scrollLeft,navLeft:n.left,navRight:n.right,lastLeft:r.left,lastRight:r.right};});
      check(width+' 末尾の語の網までnav内で表示',last.lastLeft>=last.navLeft-1&&last.lastRight<=last.navRight+1&&(last.scrollWidth<=last.clientWidth||last.scrollLeft>0),last);
      const scrolled=await metrics(page);check(width+' navスクロール後もページ全体の横はみ出しなし',!scrolled.overflow,scrolled);
      if(width===390)await shot(page,'integration-nav-last',width,height);
    }else{
      await page.locator('.appbar .tabs a[href="ami.html"]').click();await page.waitForURL('**/app/ami.html');
      check(width+' 語の網へ遷移・5タブ維持',await page.locator('.appbar .tabs a').count()===5&&(await page.locator('h1').innerText())==='語の網');
      const ami=await metrics(page);check(width+' 語の網のページ全体横はみ出しなし',!ami.overflow,ami);
      await page.locator('.appbar .tabs a[href="index.html"]').click();await page.waitForFunction(()=>typeof Q!=='undefined'&&Q.length&&document.getElementById('rangeCard'));
      check(width+' 語の網からホームへ戻る',await page.locator('.home-shortcuts').count()===1&&await page.locator('.appbar .tabs a').count()===5);
    }
    await context.close();
  }
  {
    const context=await contextFor(1280,720),page=await context.newPage();watch(page);await mainReady(page);
    await page.evaluate(()=>startList(['50-am-003'],'range'));await page.locator('.choice[data-n="1"]').click();await page.locator('button[onclick="submitQ()"]').click();
    check('統合後の過去問採点とwhy',(await page.locator('.verdict').innerText()).includes('不正解')&&await page.locator('.why').count()>0);
    await termReady(page);await startTerm(page);await page.locator('#answer-input').fill('がいじつ');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    check('統合後Enterで用語入力を採点',await page.locator('#verdict.correct').isVisible());
    await shot(page,'term-feedback',1280,720);await page.keyboard.press('Enter');
    check('統合後Enterで次問へ進む',(await page.locator('#question-count').innerText())==='2 / 5'&&await page.evaluate(()=>document.activeElement.id)==='answer-input');
    await context.close();
  }
  const swSource=fs.readFileSync(path.join(root,'app/sw.js'),'utf8');
  const sw=vm.runInNewContext(swSource+'\n({cache:SHELL_CACHE, shell:SHELL});',{self:{addEventListener(){}}});
  check('統合後SHELL_CACHEはv15',sw.cache==='ot-shell-v15',sw.cache);
  check('SHELLに語の網を保持',sw.shell.includes('./ami.html'));
  report.shellFiles=sw.shell.map(url=>{const pathname=new URL(url,base).pathname,filename=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));return {url,path:path.relative(root,filename),exists:filename.startsWith(root+path.sep)&&fs.existsSync(filename)&&fs.statSync(filename).isFile()};});
  check('SHELL全URLにローカルファイルが存在',report.shellFiles.every(file=>file.exists),report.shellFiles);
  report.serviceWorkerLimit='SHELLの静的対応のみ。実際のinstall・キャッシュ更新・圏外動作は未確認。';
}
async function run(){
  if(phase==='before'&&!fs.existsSync(baseline))try{
    execFileSync('git',['cat-file','-e','f44f310^{commit}'],{cwd:root,stdio:'pipe'});
  }catch{
    throw Error('変更前の基準f44f310がGit履歴にありません。検証済み.baseline/app/か同コミットのオブジェクトが必要です。現行画面を変更前として使わず停止します。');
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  if(phase==='after'&&scope==='integration'){
    await integrationChecks();check('統合後にJS例外なし',report.errors.length===0,report.errors);check('統合後に予期しないconsoleエラーなし',report.consoleErrors.length===0,report.consoleErrors);return;
  }
  if(scope==='home-buttons'){
    for(const [width,height]of[[1280,720],[1440,900]]){
      const context=await contextFor(width,height),page=await context.newPage();watch(page);await mainReady(page);const measure=await metrics(page);
      report.screens.push({label:'home-link-measurement',...measure});
      check(width+' ホームの用語入力導線を計測',measure.actions.some(action=>action.selector==='a[href="term-drill.html"]'),measure.actions);
      await context.close();
    }
    check('JS例外なし',report.errors.length===0,report.errors);check('予期しないconsoleエラーなし',report.consoleErrors.length===0,report.consoleErrors);return;
  }
  if(phase==='after'&&scope==='home'){
    for(const [width,height]of[[1024,768],[1280,720],[1440,900],[1920,1080]]){
      const context=await contextFor(width,height),page=await context.newPage();watch(page);await mainReady(page);
      const statRects=await page.locator('.hero .grid .stat').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
      check(width+' 最終ホームの3statが同じ行',statRects.length===3&&Math.max(...statRects.map(r=>r.y))-Math.min(...statRects.map(r=>r.y))<1,statRects);
      await shot(page,'home',width,height);await context.close();
    }
    check('JS例外なし',report.errors.length===0,report.errors);check('予期しないconsoleエラーなし',report.consoleErrors.length===0,report.consoleErrors);return;
  }
  if(phase==='after'&&scope==='term-operations'){
    await keyboardChecks();await extendedLayoutChecks();await savedProgressChecks();
    check('JS例外なし',report.errors.length===0,report.errors);check('予期しないconsoleエラーなし',report.consoleErrors.length===0,report.consoleErrors);return;
  }
  if(phase==='before'){
    await primaryScreens(1280,720);await primaryScreens(1440,900);
  }else{
    for(const [width,height]of[[1024,768],[1280,720],[1440,900],[1920,1080],[360,844],[390,844],[412,844]])await primaryScreens(width,height);
    await primaryScreens(1440,900,'dark');
    if(scope!=='screens'){await keyboardChecks();await extendedLayoutChecks();await savedProgressChecks();}
  }
  check('JS例外なし',report.errors.length===0,report.errors);check('予期しないconsoleエラーなし',report.consoleErrors.length===0,report.consoleErrors);
}
run().catch(async error=>{report.failure={message:error.message,stack:error.stack};process.exitCode=1;if(debugPage&&!debugPage.isClosed())await debugPage.screenshot({path:path.join(out,'failure.png'),fullPage:true});})
.finally(async()=>{if(browser)await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,reportName),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,scope,checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,failure:report.failure?.message,screenshots:report.screenshots.length,errors:report.errors.length,consoleErrors:report.consoleErrors.length,report:path.join(out,reportName)},null,2));});
