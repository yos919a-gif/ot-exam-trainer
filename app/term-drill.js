/* 用語入力ドリルの試作。候補の表示順・検索は正答から独立させる。
 * 例題は過去問ではなく独立した一問一答。用語集の医学本文と過去問の採点は変更しない。
 * 問題を追加する場合は、正答の用語キー・別名・出典をここで明示する。
 */
"use strict";
(() => {
  const question = {
    id: "physiology-circadian-001",
    subject: "生理学",
    prompt: "ホルモン分泌などにみられる、約24時間周期の生体リズムを何というか。",
    answer: "概日リズム",
    // 用語集の意味欄に明記された別名。括弧内の語を一律に別名と推測しない。
    aliases: [{label: "サーカディアンリズム", reading: "さーかでぃあんりずむ"}],
    source: "https://www.nigms.nih.gov/education/fact-sheets/Pages/circadian-rhythms",
  };
  const $ = id => document.getElementById(id);
  const input = $("answer-input"), list = $("answer-options"), status = $("picker-status");
  const clear = $("clear-answer"), submit = $("submit-answer"), giveUp = $("give-up");
  let glossary, entries = [], shown = [], selected = null, active = -1, composing = false, answered = false;

  const normalize = value => String(value).normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・･()（）]/g, "");

  function canonical(word){
    const seen = new Set();
    while(glossary[word]?.別名 && !seen.has(word)){
      seen.add(word);
      word = glossary[word].別名;
    }
    return word;
  }

  function closeList(){
    shown = []; active = -1;
    list.replaceChildren(); list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
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
      node.classList.toggle("active", i === active);
      node.setAttribute("aria-selected", String(i === active));
    });
    if(active >= 0){
      input.setAttribute("aria-activedescendant", `term-option-${active}`);
      list.children[active].scrollIntoView({block: "nearest"});
    }else input.removeAttribute("aria-activedescendant");
  }

  function draw(){
    closeList();
    if(answered || selected) return;
    const query = normalize(input.value);
    if(!query){ status.textContent = "読みや用語の一部を入力してください。"; return; }
    const matches = entries.filter(entry => entry.keys.some(key => key.includes(query)));
    matches.sort((a, b) => {
      const rank = entry => entry.keys.some(key => key === query) ? 0
        : entry.keys.some(key => key.startsWith(query)) ? 1 : 2;
      return rank(a) - rank(b) || a.label.localeCompare(b.label, "ja");
    });
    shown = matches.slice(0, 8);
    if(!shown.length){ status.textContent = "候補がありません。別の読みや短い言葉で試してください。"; return; }
    shown.forEach((entry, i) => {
      const option = document.createElement("li");
      option.id = `term-option-${i}`; option.className = "option";
      option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false");
      option.dataset.index = i;
      const label = document.createElement("span"); label.className = "option-label";
      label.textContent = entry.label;
      const reading = document.createElement("span"); reading.className = "option-reading";
      reading.textContent = entry.reading;
      option.append(label, reading); list.append(option);
    });
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    status.textContent = matches.length > shown.length
      ? `${matches.length}件のうち${shown.length}件を表示。続きを入力すると絞れます。`
      : `${shown.length}件の候補があります。`;
  }

  function pick(entry){
    if(!entry || answered) return;
    input.value = entry.label;
    setSelection(entry); closeList();
    status.textContent = "用語を選びました。「解答する」で確定します。";
    input.focus();
  }

  function reset(){
    answered = false; composing = false; input.disabled = false;
    clear.disabled = false; giveUp.disabled = false; input.value = "";
    $("feedback").hidden = true; $("feedback").replaceChildren();
    setSelection(null); draw();
  }

  function feedback(revealOnly = false){
    if(answered || composing || (!revealOnly && !selected)) return;
    answered = true; closeList();
    input.disabled = true; clear.disabled = true; submit.disabled = true; giveUp.disabled = true;
    const correct = !revealOnly && selected.id === canonical(question.answer);
    const panel = $("feedback");
    const verdict = document.createElement("h2");
    verdict.id = "verdict"; verdict.tabIndex = -1;
    verdict.className = `verdict ${revealOnly ? "" : correct ? "correct" : "incorrect"}`;
    verdict.textContent = revealOnly ? "答えを確認" : correct ? "正解！" : "もう一度、確認しましょう";
    panel.append(verdict);
    if(!revealOnly && !correct){
      const yours = document.createElement("p");
      yours.textContent = `あなたの解答：${selected.label}`; panel.append(yours);
    }
    const word = document.createElement("p"); word.className = "answer-word"; word.textContent = question.answer;
    const reading = document.createElement("p"); reading.className = "answer-reading";
    reading.textContent = glossary[question.answer].読み;
    const meaning = document.createElement("p"); meaning.className = "answer-meaning";
    meaning.textContent = glossary[question.answer].意味;
    const details = document.createElement("details"), summary = document.createElement("summary");
    summary.textContent = "説明の出典";
    const source = document.createElement("a"); source.href = question.source;
    source.target = "_blank"; source.rel = "noopener"; source.textContent = "NIH / NIGMS：Circadian Rhythms";
    const note = document.createElement("p");
    note.textContent = "用語の説明は搭載済みの用語集より。例題の内容は上記資料でも確認できます。";
    details.append(summary, source, note);
    const again = document.createElement("button"); again.id = "try-again";
    again.type = "button"; again.className = "btn primary"; again.textContent = "もう一度試す";
    again.addEventListener("click", () => { reset(); input.focus(); });
    panel.append(word, reading, meaning, details, again); panel.hidden = false;
    status.textContent = "解答を確認しました。";
    verdict.focus();
  }

  input.addEventListener("input", () => {
    // 変換中や削除でも即座に古い選択を破棄する。表示更新待ちの間も誤採点させない。
    setSelection(null); draw();
  });
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; draw(); });
  input.addEventListener("focus", draw);
  input.addEventListener("keydown", event => {
    if(composing || event.isComposing || event.keyCode === 229) return;
    if(event.key === "ArrowDown" || event.key === "ArrowUp"){
      event.preventDefault();
      if(list.hidden) draw();
      if(shown.length) activate(active < 0 ? (event.key === "ArrowDown" ? 0 : shown.length - 1)
        : (active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    }else if(event.key === "Enter"){
      event.preventDefault();
      if(!list.hidden && shown.length) pick(shown[active < 0 ? 0 : active]);
      else if(selected) feedback();
    }else if(event.key === "Escape"){
      event.preventDefault(); closeList();
    }else if(event.key === "Tab") closeList();
  });
  // 入力欄のフォーカスを保ち、キーボードでもタップでも同じ候補を確定する。
  list.addEventListener("mousedown", event => event.preventDefault());
  list.addEventListener("click", event => {
    const option = event.target.closest("[data-index]");
    if(option) pick(shown[Number(option.dataset.index)]);
  });
  document.addEventListener("pointerdown", event => { if(!event.target.closest(".picker")) closeList(); });
  clear.addEventListener("click", () => { input.value = ""; setSelection(null); draw(); input.focus(); });
  $("answer-form").addEventListener("submit", event => { event.preventDefault(); feedback(); });
  giveUp.addEventListener("click", () => feedback(true));

  $("question-title").textContent = question.prompt;
  $("question-subject").textContent = question.subject;
  cfetch("glossary/glossary.json").then(data => {
    glossary = data;
    if(!glossary[question.answer]) throw new Error("例題の用語が見つかりません");
    entries = Object.entries(glossary).filter(([, value]) => value.意味 && value.読み && !value.flag)
      .map(([label, value]) => ({label, reading: value.読み, id: canonical(label), keys: [normalize(label), normalize(value.読み)]}));
    for(const alias of question.aliases){
      if(!entries.some(entry => entry.label === alias.label)) entries.push({
        ...alias, id: canonical(question.answer), keys: [normalize(alias.label), normalize(alias.reading)],
      });
    }
    reset();
  }).catch(() => {
    status.classList.add("error-message");
    status.textContent = "用語を読み込めませんでした。接続を確認し、画面を再読み込みしてください。";
  });
})();
