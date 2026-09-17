const STORAGE_WRONG = "clf_wrong_ids_v1";
const STORAGE_SCORE = "clf_score_v1";
const DOMAIN_LABEL = {
  D1: "D1 クラウドの概念",
  D2: "D2 セキュリティ",
  D3: "D3 テクノロジー",
  D4: "D4 請求・サポート",
};

const ALL_QUESTIONS = (window.CLF_QUESTIONS || []).map((item, index) => ({
  ...item,
  id: item.id || index + 1,
}));

const elements = {
  statusMessage: document.getElementById("status-message"),
  tabQuiz: document.getElementById("tab-quiz"),
  tabWrong: document.getElementById("tab-wrong"),
  tabList: document.getElementById("tab-list"),
  quizSection: document.getElementById("quiz-section"),
  wrongSection: document.getElementById("wrong-section"),
  listSection: document.getElementById("list-section"),
  quizCard: document.getElementById("quiz-card"),
  quizEmpty: document.getElementById("quiz-empty"),
  quizProgress: document.getElementById("quiz-progress"),
  quizDomainLabel: document.getElementById("quiz-domain-label"),
  quizBody: document.getElementById("quiz-body"),
  quizResult: document.getElementById("quiz-result"),
  quizExplain: document.getElementById("quiz-explain"),
  nextBtn: document.getElementById("next-btn"),
  saveWrongBtn: document.getElementById("save-wrong-btn"),
  retrySavedBtn: document.getElementById("retry-saved-btn"),
  exitRetryBtn: document.getElementById("exit-retry-btn"),
  retryBanner: document.getElementById("retry-banner"),
  resetScoreBtn: document.getElementById("reset-score-btn"),
  score: document.getElementById("score"),
  accuracy: document.getElementById("accuracy"),
  choiceButtons: {
    A: document.getElementById("choice-btn-a"),
    B: document.getElementById("choice-btn-b"),
    C: document.getElementById("choice-btn-c"),
    D: document.getElementById("choice-btn-d"),
  },
  swipeFeedback: document.getElementById("swipe-feedback"),
  wrongList: document.getElementById("wrong-list"),
  wrongEmpty: document.getElementById("wrong-empty"),
  retryWrongBtn: document.getElementById("retry-wrong-btn"),
  clearWrongBtn: document.getElementById("clear-wrong-btn"),
  questionList: document.getElementById("question-list"),
  listCount: document.getElementById("list-count"),
};

const KEY_TO_CHOICE = { w: "A", a: "B", s: "C", d: "D" };
const SWIPE_TO_CHOICE = { up: "A", left: "B", down: "C", right: "D" };
const SWIPE_THRESHOLD = 48;

let domainFilter = "ALL";
let pool = [];
let currentQuestion = null;
let previousId = null;
let answered = false;
let correctCount = 0;
let answeredCount = 0;
let wrongOnly = false;
let lastMissedId = null;
let isQuizTabActive = true;
let touchStartX = 0;
let touchStartY = 0;
let isSwipeGesture = false;

function unlockSwipeScroll() {
  isSwipeGesture = false;
  document.body.classList.remove("is-swipe-lock");
}

function armSwipeLock() {
  elements.quizSection.classList.add("is-swipe-armed");
}

function disarmSwipeLock() {
  unlockSwipeScroll();
  elements.quizSection.classList.remove("is-swipe-armed");
}

function scrollQuizToTop() {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  const jump = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const header = document.querySelector(".header");
    if (header) {
      header.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };
  jump();
  window.requestAnimationFrame(() => {
    jump();
    window.setTimeout(jump, 50);
  });
}

function showStatus(message, type) {
  elements.statusMessage.textContent = message || "";
  elements.statusMessage.className = message ? `status-message ${type}` : "status-message";
}

function loadWrongIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_WRONG) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_error) {
    return new Set();
  }
}

function saveWrongIds(ids) {
  localStorage.setItem(STORAGE_WRONG, JSON.stringify([...ids]));
}

function loadScore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_SCORE) || "{}");
    correctCount = Number(parsed.correct) || 0;
    answeredCount = Number(parsed.answered) || 0;
  } catch (_error) {
    correctCount = 0;
    answeredCount = 0;
  }
}

function updateSavedUi() {
  const count = loadWrongIds().size;
  if (elements.retrySavedBtn) {
    elements.retrySavedBtn.textContent = `保存した問題を解き直す（${count}問）`;
    elements.retrySavedBtn.disabled = count === 0;
  }
  if (elements.tabWrong) {
    elements.tabWrong.textContent = count ? `保存 ${count}` : "保存";
  }
  if (elements.retryBanner) {
    elements.retryBanner.classList.toggle("hidden", !wrongOnly);
  }
  if (elements.exitRetryBtn) {
    elements.exitRetryBtn.classList.toggle("hidden", !wrongOnly);
  }
}

function setSaveButtonState(mode) {
  const btn = elements.saveWrongBtn;
  if (!btn) {
    return;
  }
  if (mode === "hidden") {
    btn.classList.add("hidden");
    btn.classList.remove("is-saved");
    btn.disabled = false;
    btn.textContent = "この問題を保存";
    return;
  }
  btn.classList.remove("hidden");
  if (mode === "saved") {
    btn.classList.add("is-saved");
    btn.disabled = true;
    btn.textContent = "保存済み";
    return;
  }
  btn.classList.remove("is-saved");
  btn.disabled = false;
  btn.textContent = "この問題を保存";
}

function saveScore() {
  localStorage.setItem(
    STORAGE_SCORE,
    JSON.stringify({ correct: correctCount, answered: answeredCount })
  );
}

function filteredQuestions() {
  let list = ALL_QUESTIONS;
  if (domainFilter !== "ALL") {
    list = list.filter((item) => item.domain === domainFilter);
  }
  if (wrongOnly) {
    const wrong = loadWrongIds();
    list = list.filter((item) => wrong.has(item.id));
  }
  return list;
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickNext() {
  pool = filteredQuestions();
  if (pool.length === 0) {
    currentQuestion = null;
    return;
  }
  const candidates = pool.filter((item) => item.id !== previousId);
  const source = candidates.length ? candidates : pool;
  currentQuestion = source[Math.floor(Math.random() * source.length)];
}

function renderChoices() {
  ["A", "B", "C", "D"].forEach((letter) => {
    const btn = elements.choiceButtons[letter];
    btn.disabled = false;
    btn.classList.remove("correct", "incorrect", "key-pressed", "swipe-pressed");
    const text = currentQuestion[`choice_${letter.toLowerCase()}`];
    btn.textContent = `${letter}. ${text}`;
  });
}

function updateScore() {
  elements.score.textContent = `スコア: ${correctCount} / ${answeredCount}`;
  const rate = answeredCount === 0 ? "-" : `${Math.round((correctCount / answeredCount) * 100)}%`;
  elements.accuracy.textContent = `正答率: ${rate}`;
  saveScore();
}

function showQuestion() {
  pickNext();
  answered = false;
  lastMissedId = null;
  setSaveButtonState("hidden");
  elements.quizResult.textContent = "";
  elements.quizResult.className = "quiz-result";
  elements.quizExplain.classList.add("hidden");
  elements.nextBtn.classList.add("hidden");
  updateSavedUi();

  if (!currentQuestion) {
    disarmSwipeLock();
    elements.quizCard.classList.add("hidden");
    elements.quizEmpty.classList.remove("hidden");
    elements.quizEmpty.textContent = wrongOnly
      ? "保存した問題はありません。通常に戻るか、間違えた問題を保存してください。"
      : "この条件の問題がありません。";
    return;
  }

  elements.quizCard.classList.remove("hidden");
  elements.quizEmpty.classList.add("hidden");
  elements.quizDomainLabel.textContent = DOMAIN_LABEL[currentQuestion.domain] || "問題";
  elements.quizBody.textContent = currentQuestion.body;
  elements.quizProgress.textContent = wrongOnly
    ? `保存した問題 ${pool.length} 問から出題`
    : `${DOMAIN_LABEL[currentQuestion.domain] || ""} ｜ 全 ${pool.length} 問`;
  renderChoices();
  elements.swipeFeedback.textContent = "";
  armSwipeLock();
  scrollQuizToTop();
}

function markWrong(id) {
  const ids = loadWrongIds();
  ids.add(id);
  saveWrongIds(ids);
}

function unmarkWrong(id) {
  const ids = loadWrongIds();
  ids.delete(id);
  saveWrongIds(ids);
}

function answer(choice) {
  if (!currentQuestion || answered) {
    return;
  }
  answered = true;
  answeredCount += 1;
  previousId = currentQuestion.id;

  const isCorrect = choice === currentQuestion.correct;
  if (isCorrect) {
    correctCount += 1;
    if (wrongOnly) {
      unmarkWrong(currentQuestion.id);
    }
    elements.quizResult.textContent = "正解";
    elements.quizResult.className = "quiz-result correct";
    setSaveButtonState("hidden");
  } else {
    lastMissedId = currentQuestion.id;
    const alreadySaved = loadWrongIds().has(currentQuestion.id);
    const right = currentQuestion[`choice_${currentQuestion.correct.toLowerCase()}`];
    elements.quizResult.textContent = `不正解（正解は ${currentQuestion.correct}. ${right}）`;
    elements.quizResult.className = "quiz-result incorrect";
    setSaveButtonState(alreadySaved ? "saved" : "ready");
  }

  ["A", "B", "C", "D"].forEach((letter) => {
    const btn = elements.choiceButtons[letter];
    btn.disabled = true;
    if (letter === currentQuestion.correct) {
      btn.classList.add("correct");
    }
    if (letter === choice && !isCorrect) {
      btn.classList.add("incorrect");
    }
  });

  elements.quizExplain.textContent = currentQuestion.explain || "";
  elements.quizExplain.classList.toggle("hidden", !currentQuestion.explain);
  elements.nextBtn.classList.remove("hidden");
  elements.swipeFeedback.textContent = "右スワイプで次の問題へ";
  updateScore();
  updateSavedUi();
  disarmSwipeLock();
}

function saveCurrentWrong() {
  const id = lastMissedId || (currentQuestion && currentQuestion.id);
  if (!id) {
    return;
  }
  markWrong(id);
  setSaveButtonState("saved");
  updateSavedUi();
  renderWrongList();
  showStatus("この問題を保存しました。上のボタンで解き直せます。", "success");
}

function startSavedRetry() {
  if (loadWrongIds().size === 0) {
    showStatus("保存した問題がまだありません。間違えたあと「この問題を保存」を押してください。", "error");
    return;
  }
  wrongOnly = true;
  domainFilter = "ALL";
  document.querySelectorAll(".chip").forEach((node) => node.classList.toggle("active", node.dataset.domain === "ALL"));
  switchTab("quiz");
  showQuestion();
  showStatus("保存した問題の解き直しを開始しました。", "info");
}

function exitSavedRetry() {
  wrongOnly = false;
  showQuestion();
  showStatus("通常の出題に戻しました。", "info");
}

function renderWrongList() {
  const ids = loadWrongIds();
  const items = ALL_QUESTIONS.filter((item) => ids.has(item.id));
  elements.wrongList.innerHTML = "";
  elements.wrongEmpty.classList.toggle("hidden", items.length > 0);
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "question-item";

    const text = document.createElement("p");
    text.className = "question-text";
    text.textContent = item.body;

    const meta = document.createElement("p");
    meta.className = "question-meta";
    meta.textContent = `${DOMAIN_LABEL[item.domain]} ／ 正解 ${item.correct}. ${item[`choice_${item.correct.toLowerCase()}`]}`;

    const actions = document.createElement("div");
    actions.className = "question-actions";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn";
    removeBtn.textContent = "この問題を削除";
    removeBtn.addEventListener("click", () => {
      unmarkWrong(item.id);
      updateSavedUi();
      renderWrongList();
    });
    actions.appendChild(removeBtn);

    li.appendChild(text);
    li.appendChild(meta);
    li.appendChild(actions);
    elements.wrongList.appendChild(li);
  });
}

function renderList() {
  elements.listCount.textContent = `${ALL_QUESTIONS.length} 問`;
  elements.questionList.innerHTML = "";
  ALL_QUESTIONS.forEach((item) => {
    const li = document.createElement("li");
    li.className = "question-item";
    li.innerHTML = `<p class="question-text">${item.id}. ${item.body}</p><p class="question-meta">${DOMAIN_LABEL[item.domain]}</p>`;
    elements.questionList.appendChild(li);
  });
}

function switchTab(tabName) {
  isQuizTabActive = tabName === "quiz";
  elements.tabQuiz.classList.toggle("active", tabName === "quiz");
  elements.tabWrong.classList.toggle("active", tabName === "wrong");
  elements.tabList.classList.toggle("active", tabName === "list");
  elements.quizSection.classList.toggle("active", tabName === "quiz");
  elements.wrongSection.classList.toggle("active", tabName === "wrong");
  elements.listSection.classList.toggle("active", tabName === "list");
  if (tabName === "quiz" && currentQuestion && !answered) {
    armSwipeLock();
  } else {
    disarmSwipeLock();
  }
  if (tabName === "wrong") {
    renderWrongList();
  }
  if (tabName === "list") {
    renderList();
  }
}

function flashChoice(letter, className) {
  const btn = elements.choiceButtons[letter];
  btn.classList.add(className);
  window.setTimeout(() => btn.classList.remove(className), 150);
}

function onKeyDown(event) {
  if (!isQuizTabActive) {
    return;
  }
  if (event.key === "Enter" && answered) {
    showQuestion();
    return;
  }
  const choice = KEY_TO_CHOICE[event.key.toLowerCase()];
  if (!choice) {
    return;
  }
  flashChoice(choice, "key-pressed");
  answer(choice);
}

function onTouchStart(event) {
  if (!isQuizTabActive || !event.changedTouches[0]) {
    return;
  }
  isSwipeGesture = false;
  touchStartX = event.changedTouches[0].clientX;
  touchStartY = event.changedTouches[0].clientY;
}

function onTouchMove(event) {
  if (!isQuizTabActive || !event.touches[0]) {
    return;
  }
  const dx = event.touches[0].clientX - touchStartX;
  const dy = event.touches[0].clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < 8) {
    return;
  }

  if (!answered) {
    isSwipeGesture = true;
    document.body.classList.add("is-swipe-lock");
    event.preventDefault();
    return;
  }

  if (dx > 8 && absX > absY) {
    isSwipeGesture = true;
    document.body.classList.add("is-swipe-lock");
    event.preventDefault();
  }
}

function onTouchEnd(event) {
  if (!isQuizTabActive || !event.changedTouches[0]) {
    unlockSwipeScroll();
    return;
  }
  const dx = event.changedTouches[0].clientX - touchStartX;
  const dy = event.changedTouches[0].clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const strong = isSwipeGesture && Math.max(absX, absY) >= SWIPE_THRESHOLD;
  unlockSwipeScroll();
  if (!strong) {
    return;
  }

  if (answered) {
    if (dx >= SWIPE_THRESHOLD && absX > absY) {
      event.preventDefault();
      showQuestion();
    }
    return;
  }

  event.preventDefault();
  let direction = "right";
  if (absY > absX) {
    direction = dy < 0 ? "up" : "down";
  } else {
    direction = dx < 0 ? "left" : "right";
  }
  const choice = SWIPE_TO_CHOICE[direction];
  flashChoice(choice, "swipe-pressed");
  elements.swipeFeedback.textContent = `スワイプ: ${choice}`;
  answer(choice);
}

function onTouchCancel() {
  unlockSwipeScroll();
}

function init() {
  loadScore();
  updateScore();
  showStatus("", "");
  updateSavedUi();
  showQuestion();
  renderList();
  renderWrongList();

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((node) => node.classList.remove("active"));
      chip.classList.add("active");
      domainFilter = chip.dataset.domain;
      wrongOnly = false;
      showQuestion();
    });
  });

  ["A", "B", "C", "D"].forEach((letter) => {
    elements.choiceButtons[letter].addEventListener("click", () => answer(letter));
  });

  elements.nextBtn.addEventListener("click", showQuestion);
  elements.saveWrongBtn.addEventListener("click", saveCurrentWrong);
  elements.retrySavedBtn.addEventListener("click", startSavedRetry);
  elements.exitRetryBtn.addEventListener("click", exitSavedRetry);
  elements.resetScoreBtn.addEventListener("click", () => {
    correctCount = 0;
    answeredCount = 0;
    updateScore();
    showQuestion();
  });
  elements.retryWrongBtn.addEventListener("click", startSavedRetry);
  elements.clearWrongBtn.addEventListener("click", () => {
    saveWrongIds(new Set());
    updateSavedUi();
    renderWrongList();
    if (wrongOnly) {
      showQuestion();
    }
  });
  elements.tabQuiz.addEventListener("click", () => switchTab("quiz"));
  elements.tabWrong.addEventListener("click", () => switchTab("wrong"));
  elements.tabList.addEventListener("click", () => switchTab("list"));
  document.addEventListener("keydown", onKeyDown);
  const swipeArea = elements.quizSection;
  swipeArea.addEventListener("touchstart", onTouchStart, { passive: true });
  swipeArea.addEventListener("touchmove", onTouchMove, { passive: false });
  swipeArea.addEventListener("touchend", onTouchEnd, { passive: false });
  swipeArea.addEventListener("touchcancel", onTouchCancel, { passive: true });
}

init();
