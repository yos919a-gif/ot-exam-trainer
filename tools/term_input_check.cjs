/* 用語入力ドリルのブラウザ検証。独立コンテキストでAPIを模擬し、学習記録は読書きしない。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base = process.env.TERM_BASE_URL || 'http://ot-trainer.test/app/';
const root = path.resolve(__dirname,'..');
const out = path.resolve(__dirname, '../docs/用語入力確認');
fs.mkdirSync(out, {recursive:true});
const report = {base, startedAt:new Date().toISOString(), checks:[], errors:[], consoleErrors:[], screenshots:[], apiWrites:0};
let browser;
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
  page.on('pageerror', e => report.errors.push({url:page.url(),message:e.message}));
  page.on('console', msg => { if(msg.type()==='error') bucket.push({url:page.url(),message:msg.text()}); });
}
async function ready(page) {
  await page.goto(base+'term-drill.html',{waitUntil:'load'});
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
      await page.locator('#answer-input').press('Enter');
      check('Enter1回で選択のみ',await page.locator('#selected-answer').isVisible()&&await page.locator('#feedback').isHidden());
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
    await page.locator('#picker-status.error-message').waitFor();
    check('読込失敗で全解答操作不可',await page.locator('#answer-input').isDisabled()&&await page.locator('#clear-answer').isDisabled()&&await page.locator('#submit-answer').isDisabled()&&await page.locator('#give-up').isDisabled());
    report.expectedLoadErrors=expected; await context.close();
  }
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
run().catch(error=>{report.failure={message:error.message,stack:error.stack};process.exitCode=1;})
.finally(async()=>{
  if(browser)await browser.close();
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,failure:report.failure?.message,errors:report.errors.length,consoleErrors:report.consoleErrors.length,report:path.join(out,'report.json')},null,2));
});
