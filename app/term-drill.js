/* 用語入力ドリル。過去問の採点・学習記録には触らず、このブラウザーに独立保存する。 */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const input = $("answer-input"), list = $("answer-options"), status = $("picker-status");
  const clear = $("clear-answer"), submit = $("submit-answer"), giveUp = $("give-up");
  const demo = new URLSearchParams(location.search).get("demo") === "1";
  const STORAGE_KEY = "ot-term-drill-v1";
  let questions = [], byId = new Map(), glossary, entries = [], entryByLabel = new Map();
  let shown = [], selected = null, active = -1, composing = false, answered = false, current = null;
  let state = {version: 1, active: null, history: []};

  const normalize = value => String(value).normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・･()（）]/g, "");

  function storageWarning(message = "このブラウザーに記録を保存できません。練習はできますが、画面を閉じると今回の回答が失われることがあります。"){
    $("storage-notice").hidden = false;
    $("storage-notice").textContent = message;
  }
  function persist(){
    if(demo) return;
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{ storageWarning(); }
  }
  function validSession(session){
    return session && Array.isArray(session.ids) && session.ids.length > 0 && session.ids.length <= questions.length &&
      new Set(session.ids).size === session.ids.length && session.ids.every(id => byId.has(id)) &&
      Number.isInteger(session.index) && session.index >= 0 && session.index <= session.ids.length &&
      Array.isArray(session.results) && (session.results.length === session.index || session.results.length === session.index + 1) &&
      session.results.length <= session.ids.length && session.results.every((result, i) => result && result.id === session.ids[i] &&
        typeof result.picked === "string" && typeof result.ok === "boolean" &&
        (result.kind === "reveal" ? result.picked === "" && result.ok === false :
          result.kind === "answer" && entryByLabel.has(result.picked) &&
          result.ok === (entryByLabel.get(result.picked).id === identity(byId.get(result.id).answer))));
  }
  function loadState(){
    if(demo) return;
    try{
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if(!saved) return;
      if(saved.version !== 1 || !Array.isArray(saved.history)) throw new Error("invalid progress");
      const history = saved.history.filter(session => validSession(session) && session.results.length === session.ids.length);
      if(history.length !== saved.history.length || (saved.active && !validSession(saved.active)))
        storageWarning("一部の保存済み記録を読み込めませんでした。有効な記録から再開するか、新しい練習を始められます。");
      state.history = history.slice(-30);
      state.active = validSession(saved.active) && saved.active.index < saved.active.ids.length ? saved.active : null;
    }catch{ storageWarning("保存済みの記録を読み込めませんでした。新しい練習を始められます。"); }
  }

  // 明示された別名を同じグループにする。参照が双方向でも循環しない。
  const parents = new Map();
  function identity(word){
    if(!parents.has(word)) parents.set(word, word);
    let root = word;
    while(parents.get(root) !== root) root = parents.get(root);
    while(parents.get(word) !== word){ const next = parents.get(word); parents.set(word, root); word = next; }
    return root;
  }
  function unite(a, b){ parents.set(identity(a), identity(b)); }
  function buildEntries(){
    for(const [word, value] of Object.entries(glossary)){
      identity(word);
      if(value.別名 && Object.hasOwn(glossary, value.別名)) unite(word, value.別名);
    }
    for(const q of questions) for(const alias of q.aliases || []) unite(alias.label, q.answer);
    const candidates = new Map();
    for(const [label, value] of Object.entries(glossary)){
      if(value.意味 && value.読み && !value.flag) candidates.set(label, {label, reading: value.読み, extraReadings: []});
    }
    for(const q of questions) for(const alias of q.aliases || []){
      if(!candidates.has(alias.label)) candidates.set(alias.label, {label: alias.label, reading: alias.reading, extraReadings: []});
      else candidates.get(alias.label).extraReadings.push(alias.reading);
    }
    entries = [...candidates.values()].map(entry => ({...entry, id: identity(entry.label), keys: [entry.label, entry.reading, ...entry.extraReadings].map(normalize)}));
    entryByLabel = new Map(entries.map(entry => [entry.label, entry]));
  }
  function question(){ return byId.get(current.ids[current.index]); }
  function screen(name){
    for(const id of ["start-screen", "question-screen", "result-screen"]) $(id).hidden = id !== name;
    $("feedback").hidden = true;
  }
  function closeList(){
    shown = []; active = -1;
    list.replaceChildren(); list.hidden = true;
    input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
  }
  function setSelection(entry){
    selected = entry;
    $("selected-answer").hidden = !entry;
    $("selected-answer").querySelector(".selected-label").textContent = entry?.label || "";
    submit.disabled = !entry || answered;
  }
  function activate(index){
    active = index;
    [...list.children].forEach((node, i) => {
      node.classList.toggle("active", i === active); node.setAttribute("aria-selected", String(i === active));
    });
    if(active >= 0){
      input.setAttribute("aria-activedescendant", `term-option-${active}`);
      list.children[active].scrollIntoView({block: "nearest"});
    }else input.removeAttribute("aria-activedescendant");
  }
  function draw(){
    closeList();
    if(answered || selected || !current) return;
    const query = normalize(input.value);
    if(!query){ status.textContent = "読みや用語の一部を入力してください。"; return; }
    const rank = entry => entry.keys.some(key => key === query) ? 0 : entry.keys.some(key => key.startsWith(query)) ? 1 : 2;
    const matches = entries.filter(entry => entry.keys.some(key => key.includes(query)))
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "ja"));
    shown = matches.slice(0, 8);
    if(!shown.length){ status.textContent = "候補がありません。別の読みや短い言葉で試してください。"; return; }
    shown.forEach((entry, i) => {
      const option = document.createElement("li");
      option.id = `term-option-${i}`; option.className = "option"; option.dataset.index = i;
      option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false");
      const label = document.createElement("span"); label.className = "option-label"; label.textContent = entry.label;
      const reading = document.createElement("span"); reading.className = "option-reading"; reading.textContent = entry.reading;
      option.append(label, reading); list.append(option);
    });
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    status.textContent = matches.length > shown.length ? `${matches.length}件のうち${shown.length}件を表示。続きを入力すると絞れます。` : `${shown.length}件の候補があります。`;
  }
  function pick(entry){
    if(!entry || answered) return;
    input.value = entry.label; setSelection(entry); closeList();
    status.textContent = "用語を選びました。「解答する」で確定します。"; input.focus();
  }
  function showMenu(moveFocus = true){
    current = null; closeList(); screen("start-screen");
    $("resume-section").hidden = !state.active;
    if(state.active) $("resume-description").textContent = `${state.active.ids.length}問中${state.active.results.length}問の回答を保存しています。`;
    const recent = state.history.at(-1);
    $("recent-summary").textContent = recent ? `前回：${recent.ids.length}問中 ${recent.results.filter(result => result.ok).length}問正解` : "";
    $("review-previous").hidden = !recent?.results.some(result => !result.ok);
    if(moveFocus){ $("start-title").tabIndex = -1; $("start-title").focus(); }
  }
  function startSession(ids){
    current = {ids: [...ids], index: 0, results: [], startedAt: Date.now()};
    if(!demo){ state.active = current; persist(); }
    renderQuestion();
  }
  function renderQuestion(){
    screen("question-screen");
    const q = question(); answered = false; composing = false;
    $("question-title").textContent = q.prompt; $("question-subject").textContent = q.subject;
    $("question-count").textContent = `${demo ? "例題 " : ""}${current.index + 1} / ${current.ids.length}`;
    $("session-progress").max = current.ids.length; $("session-progress").value = current.results.length;
    $("pause-practice").hidden = demo;
    input.value = ""; input.disabled = false; clear.disabled = false; giveUp.disabled = false;
    setSelection(null); draw();
    const result = current.results[current.index];
    if(result) showFeedback(result);
    else { $("question-title").tabIndex = -1; $("question-title").focus(); }
  }
  function addText(parent, tag, text, className){
    const element = document.createElement(tag); element.textContent = text;
    if(className) element.className = className; parent.append(element); return element;
  }
  function showFeedback(result){
    answered = true; closeList();
    input.value = result.picked; input.disabled = true; clear.disabled = true; submit.disabled = true; giveUp.disabled = true;
    $("session-progress").value = current.results.length;
    $("selected-answer").hidden = result.kind === "reveal";
    $("selected-answer").querySelector(".selected-label").textContent = result.picked;
    const q = question(), panel = $("feedback"); panel.replaceChildren();
    const verdict = addText(panel, "h2", result.kind === "reveal" ? "答えを確認" : result.ok ? "正解！" : "もう一度、確認しましょう",
      `verdict ${result.kind === "reveal" ? "" : result.ok ? "correct" : "incorrect"}`);
    verdict.id = "verdict"; verdict.tabIndex = -1;
    if(result.kind !== "reveal" && !result.ok) addText(panel, "p", `あなたの解答：${result.picked}`);
    addText(panel, "p", q.answer, "answer-word");
    addText(panel, "p", glossary[q.answer].読み, "answer-reading");
    addText(panel, "p", q.explanation, "answer-meaning");
    const details = document.createElement("details"); addText(details, "summary", "説明の出典");
    for(const item of q.sources){
      const source = addText(details, "a", item.title); source.href = item.url; source.target = "_blank"; source.rel = "noopener";
      details.append(document.createElement("br"));
    }
    panel.append(details);
    const next = addText(panel, "button", demo ? "もう一度試す" : current.index + 1 < current.ids.length ? "次の問題 →" : "結果を見る", "btn primary");
    next.id = demo ? "try-again" : "next-question"; next.type = "button";
    next.addEventListener("click", () => {
      if(demo){ startSession([questions[0].id]); return; }
      current.index++;
      if(current.index >= current.ids.length){
        state.history.push({...current, finishedAt: Date.now()}); state.history = state.history.slice(-30);
        state.active = null; persist(); showResults();
      }else { persist(); renderQuestion(); }
    }, {once: true});
    if(demo){ const back = addText(panel, "a", "練習メニューへ", "btn"); back.href = "term-drill.html"; }
    panel.hidden = false; status.textContent = "解答を確認しました。"; verdict.focus();
  }
  function answer(revealOnly = false){
    if(answered || composing || !current || (!revealOnly && !selected)) return;
    const q = question();
    const result = {id: q.id, picked: revealOnly ? "" : selected.label,
      ok: !revealOnly && selected.id === identity(q.answer), kind: revealOnly ? "reveal" : "answer", t: Date.now()};
    current.results.push(result); persist(); showFeedback(result);
  }
  function showResults(){
    screen("result-screen");
    const results = current.results, correct = results.filter(result => result.ok).length;
    const revealed = results.filter(result => result.kind === "reveal").length;
    $("result-score").textContent = `${results.length}問中 ${correct}問正解`;
    $("result-detail").textContent = `不正解 ${results.filter(result => !result.ok && result.kind === "answer").length}問・答えを見た ${revealed}問`;
    const mistakes = results.filter(result => !result.ok).map(result => result.id);
    $("review-mistakes").disabled = !mistakes.length;
    $("review-mistakes").textContent = mistakes.length ? `間違い・答えを見た問題を解き直す（${mistakes.length}問）` : "全問正解です";
    $("session-results").replaceChildren();
    for(const result of results){
      const q = byId.get(result.id), row = document.createElement("li");
      addText(row, "span", result.kind === "reveal" ? "答えを確認" : result.ok ? "正解" : "不正解", result.ok ? "correct" : "incorrect");
      addText(row, "p", q.prompt); addText(row, "p", `正答：${q.answer}（${glossary[q.answer].読み}）`);
      if(!result.ok && result.kind === "answer") addText(row, "p", `あなたの解答：${result.picked}`);
      $("session-results").append(row);
    }
    $("review-mistakes").onclick = () => startSession(mistakes);
    $("result-title").focus();
  }

  input.addEventListener("input", () => { setSelection(null); draw(); });
  input.addEventListener("compositionstart", () => { composing = true; setSelection(null); });
  input.addEventListener("compositionend", () => { composing = false; draw(); });
  input.addEventListener("focus", draw);
  input.addEventListener("keydown", event => {
    if(composing || event.isComposing || event.keyCode === 229) return;
    if(event.key === "Enter" && event.repeat){ event.preventDefault(); return; }
    if(event.key === "ArrowDown" || event.key === "ArrowUp"){
      event.preventDefault(); if(list.hidden) draw();
      if(shown.length) activate(active < 0 ? (event.key === "ArrowDown" ? 0 : shown.length - 1)
        : (active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    }else if(event.key === "Enter"){
      event.preventDefault();
      if(!list.hidden && shown.length) pick(shown[active < 0 ? 0 : active]); else if(selected) answer();
    }else if(event.key === "Escape"){ event.preventDefault(); closeList(); }
    else if(event.key === "Tab") closeList();
  });
  list.addEventListener("mousedown", event => event.preventDefault());
  list.addEventListener("click", event => { const option = event.target.closest("[data-index]"); if(option) pick(shown[Number(option.dataset.index)]); });
  // ボタン上のpointerdownで候補を消すと、ボタンが移動しclickが届かなくなる。
  // 対象のクリック処理が済んでから閉じ、タップ位置を動かさない。
  document.addEventListener("click", event => { if(!event.target.closest(".picker")) closeList(); });
  clear.addEventListener("click", () => { input.value = ""; setSelection(null); draw(); input.focus(); });
  $("answer-form").addEventListener("submit", event => { event.preventDefault(); answer(); });
  giveUp.addEventListener("click", () => answer(true));
  $("pause-practice").addEventListener("click", () => { persist(); showMenu(); $("resume-practice").focus(); });
  $("result-back").addEventListener("click", showMenu);
  $("resume-practice").addEventListener("click", () => { if(state.active){ current = state.active; renderQuestion(); } });
  $("review-previous").addEventListener("click", () => startSession(state.history.at(-1).results.filter(result => !result.ok).map(result => result.id)));
  $("reload-data").addEventListener("click", () => location.reload());
  $("start-form").addEventListener("submit", event => {
    event.preventDefault(); if(!questions.length) return;
    const ids = questions.map(q => q.id);
    if($("practice-order").value === "random") for(let i = ids.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    startSession(ids.slice(0, Number($("practice-count").value)));
  });

  cfetch("glossary/glossary.json").then(data => {
    glossary = data; questions = window.TERM_DRILL_QUESTIONS;
    if(!Array.isArray(questions) || !questions.length || questions.some(q => !q.id || !q.prompt || !q.explanation ||
      !Object.hasOwn(glossary, q.answer) || glossary[q.answer].flag || !Array.isArray(q.sources) || !q.sources.length ||
      q.sources.some(source => !/^https:\/\//.test(source.url))) || new Set(questions.map(q => q.id)).size !== questions.length) throw new Error("Invalid deck");
    byId = new Map(questions.map(q => [q.id, q])); buildEntries(); loadState();
    $("start-practice").disabled = false; $("load-status").hidden = true;
    for(const option of [...$("practice-count").options]) if(Number(option.value) > questions.length) option.remove();
    if(!$("practice-count").options.length) $("practice-count").add(new Option(`${questions.length}問`, String(questions.length)));
    $("deck-description").textContent = `生理学 ${questions.length}問。解答後に解説と出典を確認できます。`;
    if(demo) startSession([questions[0].id]); else showMenu(false);
  }).catch(() => {
    $("load-status").hidden = false; $("load-status").classList.add("error-message");
    $("load-status").textContent = "問題や用語を読み込めませんでした。接続を確認し、再読み込みしてください。";
    $("reload-data").hidden = false;
  });
})();
