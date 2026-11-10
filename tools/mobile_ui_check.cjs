/* スマホUIの前後比較。既存のPlaywrightとインストール済みChromeを利用する。
 * 実行例: node tools/mobile_ui_check.cjs before
 * APIは全てモックし、実際の学習記録は読み書きしない。 */
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const phase = process.argv[2] || 'after';
if (!['before', 'after'].includes(phase)) throw new Error('before / after を指定してください');
if(phase==='before') for(const name of ['index.html','appbar.css','graph.html','sakuin.html','kotoba.html','dendrogram.html']) {
  if(!fs.existsSync(path.resolve('docs/スマホUI確認/.baseline',name))) throw new Error(`前比較用の原本がありません: .baseline/${name}。基準コミットから原本を展開してください。`);
}
const base = process.env.UI_BASE_URL || 'http://localhost:8790/app/';
const output = path.resolve('docs/スマホUI確認', phase);
fs.mkdirSync(output, {recursive:true});
const extraOnly=process.argv.includes('--extra');
const reportPath=path.join(output,extraOnly?'extra-report.json':'report.json');
const screenFilter=process.env.UI_SCREENS?new Set(process.env.UI_SCREENS.split(',')):null;
const widths=extraOnly?[]:(process.env.UI_WIDTHS||'360,390,412,1280').split(',').map(Number);
const report = (screenFilter||process.env.UI_WIDTHS)&&fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):{phase, base, viewports:[], observations:[], errors:[], requests:[], assertions:[]};
report.errors=report.errors.filter(item=>!widths.includes(item.width));
report.requests=report.requests.filter(item=>!widths.includes(item.width));
report.assertions=report.assertions.filter(item=>!widths.includes(item.width)||item.height===640);

(async () => {
  const browser = await playwright.chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for (const width of widths) {
      const context = await browser.newContext({viewport:{width,height:width===1280?900:844},deviceScaleFactor:1,hasTouch:width<600,isMobile:width<600,serviceWorkers:'block',colorScheme:'light'});
      let apiWrites = 0;
      await context.route('**/api/**', async route => {
        if(route.request().method()!=='GET') apiWrites++;
        await route.fulfill({json:{}});
      });
      if(phase==='before') await context.route('**/app/**', async route => {
        const pathname=new URL(route.request().url()).pathname;
        const name=pathname.endsWith('/')?'index.html':path.basename(pathname);
        const original=path.resolve('docs/スマホUI確認/.baseline',name);
        if(fs.existsSync(original)) await route.fulfill({body:fs.readFileSync(original),contentType:name.endsWith('.css')?'text/css':'text/html'});
        else await route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({width,type:'pageerror',message:error.message,url:page.url()}));
      page.on('console', message => { if(message.type()==='error') report.errors.push({width,type:'console',message:message.text(),url:page.url()}); });
      page.on('response', response => {if(response.status()>=400) report.requests.push({width,status:response.status(),url:response.url()});});
      page.on('requestfailed', request => report.requests.push({width,error:request.failure()?.errorText,url:request.url()}));
      const settle = async () => { await page.waitForTimeout(180); await page.evaluate(()=>document.fonts.ready); };
      const shot = async (screen, target) => {
        if(screenFilter&&!screenFilter.has(screen)) return;
        await settle();
        if(target) await page.evaluate(selector=>{
          const top=document.querySelector(selector).getBoundingClientRect().top+scrollY-(document.querySelector('.appbar')?.getBoundingClientRect().height||0)-12;
          scrollTo({top,behavior:'instant'});
        },target);
        else await page.evaluate(()=>scrollTo(0,0));
        const metrics = await page.evaluate(() => {
          const visible = el => {
            const r=el.getBoundingClientRect(), s=getComputedStyle(el);
            if(r.width<=0||r.height<=0||s.visibility==='hidden'||s.display==='none') return false;
            for(let p=el.parentElement;p;p=p.parentElement) if(p.matches('details:not([open])')&&!p.querySelector(':scope > summary')?.contains(el)) return false;
            return true;
          };
          const controls = [...document.querySelectorAll('button,a,input:not([type=hidden]),select,textarea,summary,.choice')].filter(visible);
          const small = controls.filter(el => {
            if(el.matches('input[type=checkbox],input[type=radio]')&&el.closest('label')) return false;
            const r=el.getBoundingClientRect();return r.height<43.5||r.width<43.5;
          }).map(el=>({tag:el.tagName,text:(el.innerText||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'').trim().slice(0,60),w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)}));
          const outside=[...document.body.querySelectorAll('*')].filter(visible).filter(el=>{
            const r=el.getBoundingClientRect();
            if(r.right<=innerWidth+1&&r.left>=-1)return false;
            for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement) if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return false;
            return true;
          }).slice(0,20).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,70),text:(el.innerText||'').slice(0,65)}));
          const action=document.querySelector('.actions.sticky'),bar=document.querySelector('.appbar');
          const rect=el=>el?{top:Math.round(el.getBoundingClientRect().top),bottom:Math.round(el.getBoundingClientRect().bottom),height:Math.round(el.getBoundingClientRect().height)}:null;
          return {innerWidth,documentWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,smallControlCount:small.length,smallControls:small.slice(0,35),outside,appbar:rect(bar),action:rect(action),qFont:document.querySelector('.qtext')?getComputedStyle(document.querySelector('.qtext')).fontSize:null};
        });
        report.observations=report.observations.filter(item=>item.width!==width||item.screen!==screen);
        report.observations.push({width,screen,...metrics});
        await page.screenshot({path:path.join(output,`${width}-${screen}.png`),fullPage:!target});
        if(width===390&&['home','quiz','answer','term'].includes(screen)) await page.screenshot({path:path.join(output,`${width}-${screen}-viewport.png`)});
        console.log(`${phase}: ${width} ${screen} overflow=${metrics.overflow} small=${metrics.smallControlCount}`);
      };
      await page.goto(base,{waitUntil:'load'});
      await page.waitForFunction(()=>typeof Q!=='undefined'&&Q.length>0&&document.querySelector('#rangeCard'),null,{timeout:30000});
      await page.waitForFunction(()=>window.TEXTBOOK&&['done','offline'].includes(TEXTBOOK.builtin().state),null,{timeout:60000});
      await page.evaluate(()=>home());
      await shot('home');
      await shot('range','#rangeCard');
      await page.locator('#wordCard details').evaluate(el=>el.open=true);
      await shot('word-options','#wordCard');
      await page.locator('#tbSum').click();
      await shot('textbook','#tbSum');
      await page.evaluate(()=>startList(['50-am-003'],'range'));
      await shot('quiz');
      await page.locator('.choice[data-n="1"]').click();
      await page.locator('button[onclick="submitQ()"]').click();
      const grading=await page.evaluate(()=>({verdict:document.querySelector('.verdict')?.innerText,why:document.querySelectorAll('.why').length,terms:document.querySelectorAll('.term').length,correct:document.querySelectorAll('.choice.correct').length}));
      report.assertions.push({width,check:'誤答1問の採点と誤り理由',pass:grading.verdict?.includes('不正解')&&grading.why>0&&grading.correct===1,...grading});
      await shot('answer');
      await page.locator('.term').first().click();
      await page.waitForSelector('#termBox',{state:'visible'});
      await shot('term');
      await page.evaluate(()=>{const e=document.querySelector('#termBox');if(e)e.style.display='none';});
      await page.locator('button[onclick="nextQ()"]').click();
      await shot('result');
      await page.evaluate(()=>{
        const t=Date.now()-86400000;
        S.sessions.unshift({t,m:'mock',n:50,ok:32,pt:48,ptMax:70,jp:24,jMax:40,jNeed:15,pass:true,sub:{}});
        S.sessions.unshift({t:t-86400000,m:'mock',n:50,ok:28,pt:40,ptMax:70,jp:18,jMax:40,jNeed:15,pass:false,sub:{}});
        S.attempts['50-am-004']=[{t,ok:true,m:'mock'}];renderTrend();
      });
      await shot('trend');
      await page.evaluate(()=>{S.marks['50-am-003']=Date.now();S.notes['50-am-003']={text:'右利き・左角回の病変と症状を確認する。',u:Date.now()};renderNotes();});
      await shot('notes');
      await page.evaluate(()=>{const w=Object.keys(GLOSS).filter(wordOk).sort()[0];session=null;wsess={list:[w],idx:0,dir:'w2m',again:new Set(),n:{ok:0,mid:0,ng:0}};renderWord(false);});
      await shot('flash-front');
      await page.locator('button[onclick="renderWord(true)"]').click();
      await shot('flash-back');
      await page.evaluate(()=>startList(['50-am-001'],'range'));
      await shot('quiz-image');
      if(phase==='after'&&await page.locator('.image-button').count()){
        await page.locator('.image-button').first().click();
        await page.waitForSelector('#imageViewer[open]');
        await shot('image-zoom');
        await page.locator('#imageSize').click();
        report.assertions.push({width,check:'図の拡大と原寸切替',pass:await page.locator('#imageViewer[open]').count()===1});
        await page.keyboard.press('Escape');
      }
      for(const [screen,url,ready] of [
        ['graph','graph.html?q=%E5%89%8D%E9%8B%B8%E7%AD%8B',()=>document.querySelector('#confBody')?.innerText.length>20],
        ['sakuin','sakuin.html?q=%E7%AD%8B%E7%B4%A1%E9%8C%98',()=>document.querySelector('#list')?.innerText.length>20],
        ['kotoba','kotoba.html?w=%E7%AD%8B%E7%B4%A1%E9%8C%98',()=>document.querySelector('#card')?.innerText.length>100],
        ['dendrogram','dendrogram.html',()=>document.querySelector('#dendro .leaf')||document.querySelector('main')?.innerText.includes('失敗')]
      ]){
        await page.goto(new URL(url,base).href,{waitUntil:'load'});
        await page.waitForFunction(ready,null,{timeout:60000});
        if(screen==='dendrogram') await page.waitForTimeout(500);
        await shot(screen);
      }
      report.viewports=report.viewports.filter(item=>item.width!==width);
      report.viewports.push({width,height:width===1280?900:844,apiWritesMocked:apiWrites});
      await context.close();
      fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
    }
    if(phase==='after'&&!screenFilter) {
      const context=await browser.newContext({viewport:{width:390,height:640},isMobile:true,hasTouch:true,colorScheme:'dark',deviceScaleFactor:1,serviceWorkers:'block'});
      await context.route('**/api/**',r=>r.fulfill({json:{}}));
      const page=await context.newPage();
      page.on('pageerror',e=>report.errors.push({width:390,height:640,theme:'dark',type:'pageerror',message:e.message}));
      page.on('console',m=>{if(m.type()==='error')report.errors.push({width:390,height:640,theme:'dark',type:'console',message:m.text()});});
      const capture=async name=>{await page.waitForTimeout(150);await page.screenshot({path:path.join(output,`390-dark-640-${name}.png`)});};
      const check=(name,result)=>{report.assertions.push({width:390,height:640,theme:'dark',check:name,...result});};
      await page.goto(base,{waitUntil:'load'});
      await page.waitForFunction(()=>typeof Q!=='undefined'&&Q.length&&document.querySelector('#rangeCard'));
      await page.waitForFunction(()=>window.TEXTBOOK&&['done','offline'].includes(TEXTBOOK.builtin().state),null,{timeout:60000});
      await capture('home');
      await page.evaluate(()=>startList(['50-am-003'],'range'));
      await capture('quiz');
      check('暗色・低い画面でも固定操作が画面内',await page.evaluate(()=>{
        const r=document.querySelector('.actions.sticky').getBoundingClientRect(),p=document.querySelector('.actions.sticky .primary').getBoundingClientRect();
        return {pass:r.bottom<=innerHeight+1&&r.top>=0&&p.height>=44,barTop:r.top,barBottom:r.bottom,primaryHeight:p.height,bg:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth};
      }));
      await page.locator('.choice[data-n="1"]').click();
      await page.locator('button[onclick="submitQ()"]').click();
      await capture('answer');
      await page.locator('.term').first().click();
      await page.waitForSelector('#termBox',{state:'visible'});
      await capture('term');
      check('用語シートが画面内に収まる',await page.evaluate(()=>{const r=document.querySelector('#termBox').getBoundingClientRect();return{pass:r.top>=0&&r.bottom<=innerHeight+1,top:r.top,bottom:r.bottom};}));
      await page.locator('.term-close').click();
      check('用語の閉じるボタン', {pass:await page.locator('#termBox').isHidden()});
      await page.locator('.memo').focus();
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      await capture('memo');
      check('末尾メモを固定操作バーの上までスクロール',await page.evaluate(()=>{const m=document.querySelector('.memo').getBoundingClientRect(),a=document.querySelector('.actions.sticky').getBoundingClientRect();return{pass:m.bottom<=a.top, memoBottom:m.bottom,actionTop:a.top};}));
      await page.evaluate(()=>{const list=Object.keys(GLOSS).filter(wordOk).sort().slice(0,2);session=null;wsess={list,idx:0,dir:'w2m',again:new Set(),n:{ok:0,mid:0,ng:0}};renderWord(false);});
      await page.locator('.flash-controls>button').click();
      await capture('flash');
      check('暗記カード評価が低い画面内で44px以上',await page.evaluate(()=>{const rs=[...document.querySelectorAll('.grade button')].map(e=>e.getBoundingClientRect());return{pass:rs.length===3&&rs.every(r=>r.top>=0&&r.bottom<=innerHeight+1&&r.height>=44),heights:rs.map(r=>r.height)};}));
      await page.locator('button[onclick="gradeWord(2)"]').click();
      check('覚えていた評価で次のカードへ進む',await page.evaluate(()=>({pass:wsess.idx===1&&wsess.n.ok===1,index:wsess.idx,ok:wsess.n.ok})));
      await page.evaluate(()=>startList(['50-am-001'],'range'));
      await page.locator('.image-button').first().click();
      await page.waitForSelector('#imageViewer[open]');
      await capture('image');
      await page.locator('#imageSize').click();
      check('原寸表示へ切替', {pass:await page.locator('#imageSize').getAttribute('aria-pressed')==='true'});
      await page.locator('#imageSize').click();
      check('画面に合わせる表示へ戻る', {pass:await page.locator('#imageSize').getAttribute('aria-pressed')==='false'});
      await page.locator('#imageViewer button').first().click();
      await page.waitForTimeout(100);
      check('図を閉じると元ボタンへフォーカスが戻る',await page.evaluate(()=>({pass:document.activeElement?.classList.contains('image-button')&&!document.querySelector('#imageViewer').open,active:document.activeElement?.className})));
      for(const [name,url,ready]of[
        ['graph','graph.html?q=%E5%89%8D%E9%8B%B8%E7%AD%8B',()=>document.querySelector('#confBody')?.innerText.length>20],
        ['sakuin','sakuin.html?q=%E7%AD%8B%E7%B4%A1%E9%8C%98',()=>document.querySelector('#list')?.innerText.length>20],
        ['kotoba','kotoba.html?w=%E7%AD%8B%E7%B4%A1%E9%8C%98',()=>document.querySelector('#card')?.innerText.length>100],
        ['dendrogram','dendrogram.html',()=>document.querySelector('#dendro .leaf')]
      ]){
        await page.goto(new URL(url,base).href);await page.waitForFunction(ready,null,{timeout:60000});await capture(name);
        check(`${name}暗色・低い画面の横はみ出し`,await page.evaluate(()=>({pass:document.documentElement.scrollWidth<=innerWidth+1,width:document.documentElement.scrollWidth})));
      }
      await context.close();
    }
  } finally { await browser.close();fs.writeFileSync(reportPath,JSON.stringify(report,null,2)); }
  const failures=report.assertions.filter(x=>!x.pass);
  const overflows=report.observations.filter(x=>x.overflow).map(x=>`${x.width}-${x.screen}`);
  console.log(JSON.stringify({screens:report.observations.length,errors:report.errors.length,requests:report.requests.length,overflows,failures}));
  if(failures.length||report.errors.length||report.requests.length||overflows.length) process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
