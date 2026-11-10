/* 用語入力ドリルのブラウザ検証。独立コンテキストでAPIを模擬し、学習記録は読書きしない。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {chromium} = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base = process.env.TERM_BASE_URL || 'http://ot-trainer.test/app/';
const root = path.resolve(__dirname,'..');
const out = path.resolve(__dirname, '../docs/用語入力連続確認');
fs.mkdirSync(out, {recursive:true});
const report = {base, startedAt:new Date().toISOString(), checks:[], errors:[], consoleErrors:[], screenshots:[], apiWrites:0};
let browser, debugPage;
const storageKey = 'ot-term-drill-v1';
const existingProgressKey = 'ot-exam-progress-v1';
const glossary = JSON.parse(fs.readFileSync(path.join(root,'content/glossary/glossary.json'),'utf8'));
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/term-questions.js'),'utf8'),sandbox);
const deck = JSON.parse(JSON.stringify(sandbox.window.TERM_DRILL_QUESTIONS));
const check = (name, value, detail) => {
  report.checks.push({name, pass:!!value, ...(detail===undefined?{}:{detail})});
  assert.ok(value, name + (detail===undefined?'':': '+JSON.stringify(detail)));
};
async function contextFor(width, colorScheme='light') {
  const context = await browser.newContext({viewport:{width,height:width===1280?900:844},hasTouch:width<600,isMobile:width<600,deviceScaleFactor:1,locale:'ja-JP',serviceWorkers:'block',colorScheme});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.origin!==new URL(base).origin) return route.abort();
    if(url.pathname.startsWith('/api/')) {
      if(route.request().method()!=='GET') report.apiWrites++;
      return route.fulfill({json:{}});
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) return route.fulfill({status:404,body:'not found'});
    const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json'};
    return route.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  return context;
}
function watch(page, bucket=report.consoleErrors) {
  debugPage=page;
  page.on('pageerror', e => report.errors.push({url:page.url(),message:e.message}));
  page.on('console', msg => { if(msg.type()==='error') bucket.push({url:page.url(),message:msg.text()}); });
}
async function ready(page) {
  await page.goto(base+'term-drill.html?demo=1',{waitUntil:'load'});
  await page.locator('#answer-input').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('answer-input').disabled);
}
async function hasCircadian(page) {
  await page.getByRole('option').filter({has:page.locator('.option-label', {hasText:/^概日リズム$/})}).waitFor();
}
async function circadianOption(page) { return page.getByRole('option').filter({has:page.locator('.option-label', {hasText:/^概日リズム$/})}); }
async function shot(page, name) {
  // フォーカスによるスクロール位置を戻し、全頁画像の途中へstickyヘッダーを写さない。
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(80);
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  report.screenshots.push(name+'.png');
}
async function overflow(page) {
  return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
}
async function retry(page) { await page.locator('#try-again').click(); }
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const termOption = (page, label) => page.getByRole('option').filter({has:page.locator('.option-label',{hasText:new RegExp('^'+escapeRegExp(label)+'$')})});
const stored = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
async function menuReady(page) {
  await page.goto(base+'term-drill.html',{waitUntil:'load'});
  await page.waitForFunction(()=>!document.getElementById('start-practice').disabled);
}
async function begin(page, count=5, order='fixed') {
  await page.locator('#practice-count').selectOption(String(count));
  await page.locator('#practice-order').selectOption(order);
  await page.locator('#start-practice').click();
  await page.locator('#answer-input').waitFor({state:'visible'});
}
async function choose(page, label, query=label) {
  await page.locator('#answer-input').fill(query);
  const option=termOption(page,label);
  await option.waitFor();
  await option.click();
  await page.locator('#submit-answer').click();
}
async function practiceChecks() {
  check('生理学20問・正答キー・問題IDの一意性',deck.length===20&&new Set(deck.map(q=>q.id)).size===20&&deck.every(q=>glossary[q.answer]&&!glossary[q.answer].flag));
  check('全問題に解説と根拠HTTPSリンク',deck.every(q=>q.explanation&&q.sources.length&&q.sources.every(s=>s.title&&/^https:\/\//.test(s.url))));
  for(const width of [360,390,412,1280]) {
    const context=await contextFor(width),page=await context.newPage();watch(page);
    await menuReady(page);
    check(width+' 練習メニューで初期候補なし',await page.locator('#start-screen').isVisible()&&await page.locator('#answer-options [role=option]').count()===0);
    let metric=await overflow(page);check(width+' メニュー横はみ出しなし',metric.scrollWidth<=metric.width,metric);
    const controls=await page.locator('#start-screen button:visible,#start-screen select:visible,#start-screen a:visible').evaluateAll(nodes=>nodes.map(n=>({text:n.innerText,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
    check(width+' メニュー操作44px以上',controls.every(r=>r.height>=44&&r.width>=44),controls);
    if(width===390||width===1280)await shot(page,width+'-setup');
    await begin(page);
    check(width+' 5問開始・問題順',(await page.locator('#question-count').innerText())==='1 / 5'&&(await page.locator('#question-title').innerText())===deck[0].prompt);
    await page.locator('#answer-input').fill('がいじつ');await hasCircadian(page);
    metric=await overflow(page);check(width+' 練習候補横はみ出しなし',metric.scrollWidth<=metric.width,metric);
    const rows=await page.getByRole('option').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    check(width+' 練習候補タップ領域44px以上',rows.length>0&&rows.every(h=>h>=44),rows);
    if(width===390)await shot(page,'390-practice-candidates');
    await context.close();
  }
  {
    const context=await contextFor(390),page=await context.newPage();watch(page);
    await menuReady(page);
    const sentinel=JSON.stringify({attempts:{'qa-sentinel':[{ok:1,t:1}]},notes:{'qa-sentinel':'既存の学習記録を維持'}});
    await page.evaluate(([key,value])=>localStorage.setItem(key,value),[existingProgressKey,sentinel]);
    await begin(page,5);
    await choose(page,deck[0].answer,glossary[deck[0].answer].読み);
    check('採点後1件だけ保存',(await stored(page)).active.results.length===1);
    await page.locator('#answer-form').dispatchEvent('submit');
    check('二重採点で回答重複なし',(await stored(page)).active.results.length===1);
    await page.locator('#next-question').click();
    check('次問で入力と選択・採点状態を初期化',await page.locator('#answer-input').inputValue()===''&&await page.locator('#selected-answer').isHidden()&&await page.locator('#submit-answer').isDisabled()&&await page.locator('#feedback').isHidden());
    await choose(page,'ALS','ＡＬＳ');
    check('誤答は正答と区別され保存',(await stored(page)).active.results[1].ok===false&&await page.locator('#verdict.incorrect').isVisible());
    await page.reload({waitUntil:'load'});await page.locator('#resume-practice').waitFor();await page.locator('#resume-practice').click();
    check('リロード後に採点済み状態を再開',(await page.locator('#question-count').innerText())==='2 / 5'&&await page.locator('#verdict.incorrect').isVisible()&&await page.locator('#answer-input').isDisabled()&&(await stored(page)).active.results.length===2);
    await page.locator('#next-question').click();await page.locator('#give-up').click();
    const reveal=(await stored(page)).active.results[2];
    check('答えを見るはrevealで正解扱いしない',reveal.kind==='reveal'&&!reveal.ok&&await page.locator('#verdict.correct,#verdict.incorrect').count()===0);
    await page.locator('#next-question').click();
    await page.locator('#answer-input').fill('ぐるか');
    check('中断前に候補表示',await page.locator('#answer-options').isVisible());
    await page.locator('#pause-practice').tap();
    check('中断して保存済み回答数を案内',(await page.locator('#resume-description').innerText()).includes('3問')&&await page.locator('#start-screen').isVisible());
    await page.reload({waitUntil:'load'});await page.locator('#resume-practice').waitFor();await page.locator('#resume-practice').click();
    check('未採点の問から再開・未確定入力は空',(await page.locator('#question-count').innerText())==='4 / 5'&&await page.locator('#answer-input').inputValue()===''&&await page.locator('#feedback').isHidden());
    await choose(page,deck[3].answer,glossary[deck[3].answer].読み);await page.locator('#next-question').click();
    await choose(page,deck[4].answer,glossary[deck[4].answer].読み);await page.locator('#next-question').click();
    check('5問の混在結果集計',(await page.locator('#result-score').innerText())==='5問中 3問正解'&&(await page.locator('#result-detail').innerText())==='不正解 1問・答えを見た 1問');
    check('全問の回答一覧を保持',await page.locator('#session-results li').count()===5);
    let save=await stored(page);
    check('終了後はactiveを消してhistoryへ1件保存',save.active===null&&save.history.length===1&&save.history[0].results.length===5);
    await shot(page,'390-mixed-result');
    check('別の過去問成績保存キーを不変',await page.evaluate(key=>localStorage.getItem(key),existingProgressKey)===sentinel);
    await page.locator('#review-mistakes').click();
    save=await stored(page);
    check('誤答と答えを見た2問だけ再出題',save.active.ids.length===2&&JSON.stringify(save.active.ids)===JSON.stringify([deck[1].id,deck[2].id]));
    await choose(page,deck[1].answer);await page.locator('#next-question').click();await choose(page,deck[2].answer);await page.locator('#next-question').click();
    check('解き直し全問正解で再出題無効',(await page.locator('#result-score').innerText())==='2問中 2問正解'&&await page.locator('#review-mistakes').isDisabled());
    await page.locator('#result-back').click();
    check('完了履歴をメニューに表示',(await page.locator('#recent-summary').innerText()).includes('2問中 2問正解')&&await page.locator('#review-previous').isHidden());
    await context.close();
  }
  {
    const context=await contextFor(1280),page=await context.newPage();watch(page);
    await menuReady(page);await begin(page,20);
    for(let i=0;i<deck.length;i++){
      const q=deck[i];
      check('全20問の問題順 '+q.id,(await page.locator('#question-title').innerText())===q.prompt);
      await choose(page,q.answer,glossary[q.answer].読み);
      check('読みから候補選択して正解 '+q.answer,await page.locator('#verdict.correct').isVisible());
      await page.locator('#next-question').click();
    }
    check('20問すべて正解の集計',(await page.locator('#result-score').innerText())==='20問中 20問正解'&&await page.locator('#session-results li').count()===20&&await page.locator('#review-mistakes').isDisabled());
    await shot(page,'1280-all-correct-result');
    await page.locator('#result-back').click();
    for(const count of [10,20]){
      await begin(page,count,'random');const ids=(await stored(page)).active.ids;
      check('ランダム'+count+'問の重複・欠落なし',ids.length===count&&new Set(ids).size===count&&ids.every(id=>deck.some(q=>q.id===id)));
      await page.locator('#pause-practice').click();
    }
    // 出題数や履歴を作為的に改変せず、通常の保存形式の単問中断データで別名ごとを検証する。
    for(const q of deck)for(const alias of q.aliases||[]){
      await page.evaluate(([key,id])=>localStorage.setItem(key,JSON.stringify({version:1,active:{ids:[id],index:0,results:[],startedAt:Date.now()},history:[]})),[storageKey,q.id]);
      await page.reload({waitUntil:'load'});await page.locator('#resume-practice').waitFor();await page.locator('#resume-practice').click();
      await choose(page,alias.label,alias.reading);
      check('別名の読みから候補選択して正解 '+alias.label,await page.locator('#verdict.correct').isVisible());
    }
    await context.close();
  }
  {
    const context=await contextFor(390,'dark'),page=await context.newPage();watch(page);
    await menuReady(page);await shot(page,'390-dark-setup');await begin(page,5);
    await page.locator('#answer-input').fill('がいじつ');await hasCircadian(page);await shot(page,'390-dark-practice');
    for(let i=0;i<5;i++){
      await page.locator('#give-up').click();
      check('暗色の答えを見る後に次へ '+i,await page.locator('#next-question').count()===1,await page.locator('#question-count').innerText());
      await page.locator('#next-question').click();
    }
    check('暗色でも答えを見た5問の結果',(await page.locator('#result-score').innerText())==='5問中 0問正解'&&(await page.locator('#result-detail').innerText()).includes('答えを見た 5問'));
    await shot(page,'390-dark-result');await page.locator('#result-back').click();
    check('メニューから前回の間違いへ入口',await page.locator('#review-previous').isVisible());
    await page.locator('#review-previous').click();
    check('前回の間違いをメニューから再開',(await stored(page)).active.ids.length===5);
    await context.close();
  }
  {
    const context=await contextFor(390),page=await context.newPage();watch(page);
    await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError');};});
    await menuReady(page);await begin(page,5);
    check('保存拒否を案内して練習継続',await page.locator('#storage-notice').isVisible()&&await page.locator('#answer-input').isEnabled());
    await choose(page,deck[0].answer);await page.locator('#next-question').click();
    check('保存拒否でも採点・次問に進める',(await page.locator('#question-count').innerText())==='2 / 5');
    await context.close();
  }
  const invalidResults=[
    {id:deck[0].id,picked:'',ok:true,kind:'reveal'},
    {id:deck[0].id,picked:'存在しない候補',ok:true,kind:'answer'},
    {id:deck[0].id,picked:deck[0].answer,ok:false,kind:'answer'},
    {id:deck[0].id,picked:deck[2].answer,ok:true,kind:'answer'},
  ].map(result=>JSON.stringify({version:1,history:[],active:{ids:[deck[0].id],index:0,results:[result]}}));
  for(const invalid of ['{broken',JSON.stringify({version:99,history:[]}),JSON.stringify({version:1,history:[],active:{ids:['unknown'],index:0,results:[]}}),...invalidResults]){
    const context=await contextFor(390),page=await context.newPage();watch(page);
    await context.addInitScript(([key,value])=>localStorage.setItem(key,value),[storageKey,invalid]);
    await menuReady(page);
    check('壊れた・旧版・不明IDの保存から新規開始可能 '+invalid.slice(0,30),await page.locator('#start-practice').isEnabled()&&await page.locator('#resume-section').isHidden());
    await begin(page,5);await choose(page,deck[0].answer);
    check('不正保存でも新規問題を採点可能 '+invalid.slice(0,30),await page.locator('#verdict.correct').isVisible());
    await context.close();
  }
  {
    const context=await contextFor(390),page=await context.newPage();watch(page);
    await ready(page);await choose(page,deck[0].answer);
    check('例題モードは独立記録を保存しない',await page.evaluate(key=>localStorage.getItem(key),storageKey)===null);
    await context.close();
  }
}
async function run() {
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for(const width of [360,390,412,1280]) {
    const context = await contextFor(width), page = await context.newPage();
    watch(page);
    await ready(page);
    check(width+' 初期候補なし',await page.getByRole('option').count()===0 && await page.locator('#answer-options').isHidden());
    check(width+' 選択前は採点不可',await page.locator('#submit-answer').isDisabled());
    let metric=await overflow(page);
    check(width+' 初期横はみ出しなし',metric.scrollWidth<=metric.width,metric);
    await page.locator('#answer-input').fill('がいじつ');
    await hasCircadian(page);
    check(width+' 候補表示中は採点なし',await page.locator('#feedback').isHidden() && await page.locator('#submit-answer').isDisabled());
    const rects = await page.getByRole('option').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
    check(width+' 候補44px以上',rects.length>0 && rects.every(r=>r.height>=44&&r.width>=44),rects);
    metric=await overflow(page);
    check(width+' 候補横はみ出しなし',metric.scrollWidth<=metric.width,metric);
    if(width!==412) await shot(page,width+'-candidates');
    if(width<600) await (await circadianOption(page)).tap();
    else await (await circadianOption(page)).click();
    check(width+' 選択だけでは採点なし',await page.locator('#feedback').isHidden() && await page.locator('#submit-answer').isEnabled());
    check(width+' 選択後は候補を閉じる',await page.locator('#answer-options').isHidden());
    await page.locator('#submit-answer').click();
    check(width+' 正解・意味表示',await page.locator('#verdict').innerText()==='正解！' && (await page.locator('.answer-meaning').innerText()).includes('24時間'));
    metric=await overflow(page);
    check(width+' 採点後横はみ出しなし',metric.scrollWidth<=metric.width,metric);
    if(width!==412) await shot(page,width+'-correct');
    if(width===390) {
      for(const query of ['ガイジツ','ｶﾞｲｼﾞﾂ',' がい じつ ']) {
        await retry(page); await page.locator('#answer-input').fill(query); await hasCircadian(page);
        check('表記正規化 '+query,(await page.getByRole('option').allTextContents()).some(t=>t.includes('概日リズム')));
        await (await circadianOption(page)).click(); await page.locator('#submit-answer').click();
      }
      await retry(page);
      await page.locator('#answer-input').fill('ＡＬＳ');
      check('全角英字の正規化',(await page.getByRole('option').allTextContents()).some(t=>t.includes('ALS')));
      await page.locator('#clear-answer').click();
      check('クリアで候補・選択を解除',await page.locator('#answer-input').inputValue()===''&&await page.getByRole('option').count()===0&&await page.locator('#submit-answer').isDisabled());
      await page.locator('#answer-input').fill('がいじつ'); await hasCircadian(page);
      await page.locator('#answer-input').dispatchEvent('compositionstart');
      await page.locator('#answer-input').dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true});
      check('IME変換中Enterで候補未選択',await page.locator('#selected-answer').isHidden()&&await page.locator('#submit-answer').isDisabled()&&await page.locator('#feedback').isHidden());
      await page.locator('#answer-input').dispatchEvent('compositionend');
      await page.locator('#answer-input').dispatchEvent('keydown',{key:'Enter',code:'Enter',repeat:true});
      check('Enter長押しで候補未選択',await page.locator('#selected-answer').isHidden()&&await page.locator('#feedback').isHidden());
      await page.locator('#answer-input').press('Enter');
      check('Enter1回で選択のみ',await page.locator('#selected-answer').isVisible()&&await page.locator('#feedback').isHidden());
      await page.locator('#answer-input').dispatchEvent('keydown',{key:'Enter',code:'Enter',repeat:true});
      check('選択後のEnter長押しで未採点',await page.locator('#feedback').isHidden());
      await page.locator('#answer-input').fill('がい');
      check('選択後の編集で即座に採点不可',await page.locator('#submit-answer').isDisabled()&&await page.locator('#selected-answer').isHidden());
      await page.locator('#answer-input').fill('がいじつ'); await hasCircadian(page);
      await page.locator('#answer-input').press('Enter');
      await page.locator('#answer-input').press('Enter');
      check('Enter2回目で正解',await page.locator('#verdict').innerText()==='正解！');
      await retry(page); await page.locator('#answer-input').fill('しん');
      await page.locator('#answer-input').press('ArrowDown');
      check('下キーで先頭候補','term-option-0'===await page.locator('#answer-input').getAttribute('aria-activedescendant'));
      await page.locator('#answer-input').press('ArrowDown');
      check('下キーで次候補','term-option-1'===await page.locator('#answer-input').getAttribute('aria-activedescendant'));
      await page.locator('#answer-input').press('ArrowUp');
      check('上キーで前候補','term-option-0'===await page.locator('#answer-input').getAttribute('aria-activedescendant'));
      await page.locator('#answer-input').press('Escape');
      check('Escapeで候補を閉じる',await page.locator('#answer-options').isHidden());
      await page.locator('#answer-input').fill('zzzzzzzzzz');
      check('候補なし表示',(await page.locator('#picker-status').innerText()).includes('候補がありません')&&await page.getByRole('option').count()===0);
      await page.locator('#answer-input').fill('しん');
      const wrong = page.getByRole('option').first();
      const wrongName = await wrong.locator('.option-label').innerText();
      await wrong.click(); await page.locator('#submit-answer').click();
      check('誤答表示と正答提示',await page.locator('#verdict.incorrect').count()===1&&(await page.locator('#feedback').innerText()).includes(wrongName)&&(await page.locator('.answer-word').innerText())==='概日リズム');
      await retry(page);
      check('リトライ初期化',await page.locator('#answer-input').inputValue()===''&&await page.locator('#feedback').isHidden()&&await page.locator('#submit-answer').isDisabled());
      await page.locator('#give-up').click();
      check('答えを見るは採点しない',await page.locator('#verdict').innerText()==='答えを確認'&&await page.locator('#verdict.correct,#verdict.incorrect').count()===0);
      await retry(page); await page.locator('#answer-input').fill('さーかで');
      const alias = page.getByRole('option').filter({hasText:'サーカディアンリズム'});
      await alias.click(); await page.locator('#submit-answer').click();
      check('明示別名も正解',await page.locator('#verdict').innerText()==='正解！');
      await retry(page);await page.locator('#answer-input').fill('がいじつ');await hasCircadian(page);
      await page.locator('#give-up').tap();
      check('候補表示中の答えを見るタップが有効',await page.locator('#verdict').innerText()==='答えを確認');
    }
    await context.close();
  }
  {
    const context=await contextFor(390,'dark'),page=await context.newPage(); watch(page);
    await ready(page);await page.locator('#answer-input').fill('がいじつ');await hasCircadian(page);
    await shot(page,'390-dark-candidates');
    const colors=await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.body).color}));
    check('暗色の背景色',colors.bg==='rgb(18, 27, 36)',colors);
    await (await circadianOption(page)).click();await page.locator('#submit-answer').click();await shot(page,'390-dark-correct');
    await context.close();
  }
  {
    const context=await contextFor(390),page=await context.newPage(); const expected=[]; watch(page,expected);
    await context.route('**/content/glossary/glossary.json*',route=>route.fulfill({status:503,body:'unavailable'}));
    await page.goto(base+'term-drill.html',{waitUntil:'load'});
    await page.locator('#load-status.error-message').waitFor();
    check('読込失敗で全解答操作不可',await page.locator('#answer-input').isDisabled()&&await page.locator('#clear-answer').isDisabled()&&await page.locator('#submit-answer').isDisabled()&&await page.locator('#give-up').isDisabled());
    report.expectedLoadErrors=expected; await context.close();
  }
  await practiceChecks();
  {
    const context=await contextFor(390),page=await context.newPage(); watch(page);
    await page.goto(base,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof Q!=='undefined'&&Q.length>0&&document.getElementById('rangeCard'),null,{timeout:60000});
    await page.evaluate(()=>startList(['50-am-003'],'range'));
    await page.locator('.choice[data-n="1"]').click();
    await page.locator('button[onclick="submitQ()"]').click();
    const result=await page.evaluate(()=>({verdict:document.querySelector('.verdict')?.innerText,why:document.querySelectorAll('.why').length}));
    check('既存過去問の採点と誤り理由',result.verdict?.includes('不正解')&&result.why>0,result);
    await page.evaluate(()=>home());
    check('本体から用語入力への導線',await page.locator('a[href="term-drill.html"]').count()===1);
    await context.close();
  }
  check('予期しないJS例外なし',report.errors.length===0,report.errors);
  check('予期しないconsoleエラーなし',report.consoleErrors.length===0,report.consoleErrors);
}
run().catch(async error=>{
  report.failure={message:error.message,stack:error.stack};process.exitCode=1;
  if(debugPage&&!debugPage.isClosed()){
    report.failure.state=await debugPage.evaluate(()=>({text:document.body.innerText,inputs:[...document.querySelectorAll('button')].map(b=>({id:b.id,disabled:b.disabled})),saved:localStorage.getItem('ot-term-drill-v1')}));
    await debugPage.screenshot({path:path.join(out,'failure.png'),fullPage:true});
  }
})
.finally(async()=>{
  if(browser)await browser.close();
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,failure:report.failure?.message,errors:report.errors.length,consoleErrors:report.consoleErrors.length,report:path.join(out,'report.json')},null,2));
});
