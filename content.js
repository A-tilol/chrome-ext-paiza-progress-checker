const WAIT_MSEC_FOR_MENU_LIST_PAGE = 1000;
const SEP = "__$sep$__";
const RADIO = [
  {
    value: 0,
    id: "ok",
    label: "完全理解",
    info: "自分で考えたり調べたりすることで解くことができる",
  },
  {
    value: 1,
    id: "working",
    label: "もう少し",
    info: "誰かに聞いたり答えを見たりすることで解くことができる",
  },
  {
    value: 2,
    id: "notStarted",
    label: "未着手",
    info: "まだ解いていない問題",
  },
];

// 理解度チェック用のラジオボタンを作成
const createCheckers = async (menuTitle, problemId) => {
  menuTitle = menuTitle.replace(/\s/g, "");
  problemId = problemId.replace(/\s/g, "");

  const menuHash8 = await sha256Prefix8(menuTitle);
  const problemHash8 = await sha256Prefix8(problemId);

  let checkerElm = document.createElement("div");
  checkerElm.className = "inline-radio";
  for (const radio of RADIO) {
    const checkbox = document.createElement("input");
    checkbox.type = "radio";
    checkbox.name = `${problemHash8}`;
    checkbox.id = `${menuHash8}${SEP}${problemHash8}${SEP}${radio.value}`;
    checkbox.checked = true;
    checkbox.className = "radio-inline__input";
    checkbox.addEventListener("change", radioChangeListener);
    checkerElm.append(checkbox);

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = radio.label;
    label.className = "radio-inline__label";
    checkerElm.append(label);
  }
  return checkerElm;
};

// ページ内のすべての問題にラジオボタンを追加
const createAllRadios = async () => {
  const menuTitle = document.querySelector(".a-works-heading1").textContent;

  let problemElms = document.getElementsByClassName("m-practice-problem");
  for (const problemElm of problemElms) {
    const problemHeaderElm = problemElm.querySelector(
      ".m-practice-problem__heading"
    );
    let problemId = problemHeaderElm.textContent;

    const checkerElm = await createCheckers(menuTitle, problemId);

    const problemEnemyElm = problemElm.querySelector(
      ".m-practice-problem__enemy"
    );
    problemEnemyElm.after(checkerElm);
  }
};

const sha256Prefix8 = async (text) => {
  const uint8 = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", uint8);
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
};

// チェックボックスの状態を保存
const saveRadioState = async (event) => {
  const [menuHash, problemHash, progress] = event.srcElement.id.split(SEP);

  let states = await chrome.storage.sync.get(menuHash);
  states[menuHash] = states[menuHash] || {};
  states[menuHash][problemHash] = progress;

  await chrome.storage.sync.set({
    [menuHash]: states[menuHash],
  });
};

const restoreStatesInMenu = async () => {
  const menuTitle = document
    .querySelector(".a-works-heading1")
    .textContent.replace(/\s/g, "");
  const menuHash = await sha256Prefix8(menuTitle);

  let states = await chrome.storage.sync.get(menuHash);
  return [menuHash, states[menuHash] || {}];
};

// チェックボックスの状態を読み込んで再現
const loadRadioStates = async () => {
  const [menuHash, states] = await restoreStatesInMenu();

  for (const problemHash of Object.keys(states)) {
    const radioValue = states[problemHash];
    const checkboxId = `${menuHash}${SEP}${problemHash}${SEP}${radioValue}`;

    let stateRadioElm = document.getElementById(checkboxId);
    if (stateRadioElm) {
      stateRadioElm.checked = true;
    }
  }
};

const countStates = (problemN, menuStates) => {
  let ok = 0;
  let working = 0;
  let notStarted = problemN;
  if (!menuStates) {
    return [ok, working, notStarted];
  }

  for (const problem of Object.keys(menuStates)) {
    if (menuStates[problem] == 0) {
      ok++;
    } else if (menuStates[problem] == 1) {
      working++;
    }
  }
  return [ok, working, notStarted - ok - working];
};

const createProgressSummryInMenuPage = async () => {
  const extractNumOfProblems = () => {
    const text = document.querySelector(
      ".m-mondai-problems-progress__value"
    ).textContent;
    return Number(text.split("/").pop().replace(/\s/g, "").replace("問", ""));
  };

  const problemN = extractNumOfProblems();

  const [_, states] = await restoreStatesInMenu();
  const stateCounts = countStates(problemN, states);

  let summaryElm = document.getElementById("$$summary__span$$");
  if (summaryElm) {
    summaryElm.remove();
  }

  summaryElm = document.createElement("span");
  summaryElm.id = "$$summary__span$$";
  summaryElm.className = "summary__span";
  for (let i = 0; i < RADIO.length; i++) {
    let label = document.createElement("label");
    label.textContent = `${RADIO[i].label} ${stateCounts[i]}問`;
    // label.textContent = `${RADIO[i].label} ${stateCounts[i]}/${problemN}`;
    label.classList.add("summary__label", `summary__label__${i}`);
    summaryElm.append(label);
  }

  let ankerElm = document.querySelector("h2.a-works-heading1");
  ankerElm.append(summaryElm);

  // Paizaのプログレスバーを更新
  let elm = document
    .querySelector(".m-mondai-problems-progress__value")
    .querySelector("span");
  elm.textContent = stateCounts[0];

  const progressPercentage = ((stateCounts[0] / problemN) * 100).toFixed(1);
  let barElm = document.querySelector(".m-mondai-progress__bar");
  barElm.style.width = `${progressPercentage}%`;
};

const createElementForMenuListPage = async () => {
  const extractNumOfProblems = (elm) => {
    return Number(
      elm.textContent.split("/").pop().replace(/\s/g, "").replace("問完了", "")
    );
  };

  // restore all states
  let allStates = await chrome.storage.sync.get();

  let mondaiElms = document.getElementsByClassName("m-mondai-set__inner");
  for (let i = 0; i < mondaiElms.length; i++) {
    // 問題数の取得
    let progressElm = mondaiElms[i].querySelector(".m-mondai-progress__text");
    if (!progressElm) {
      continue;
    }
    const problemN = extractNumOfProblems(progressElm);

    // ステータスを取得
    let titleElm = mondaiElms[i].querySelector(".m-mondai-set__title");
    const title = titleElm.textContent.replace(/\s/g, "");
    const titleHash = await sha256Prefix8(title);
    const stateCounts = countStates(problemN, allStates[titleHash]);

    // 完了問題数の更新
    progressElm.textContent = `${stateCounts[0]}/${problemN}問完了`;

    // 進捗バーの更新
    let progressBBarElm = mondaiElms[i].querySelector(
      ".m-mondai-progress__bar"
    );
    const progressPercentage = ((stateCounts[0] / problemN) * 100).toFixed(1);
    progressBBarElm.style.width = `${progressPercentage}%`;
  }
};

const countSlash = (s) => {
  const regex = new RegExp("/", "g");
  const matches = s.match(regex);
  return matches ? matches.length : 0;
};

const radioChangeListener = async (event) => {
  await saveRadioState(event);
  await createProgressSummryInMenuPage();
};

const createElementForMenuPage = async () => {
  // 進捗サマリーを追加
  createProgressSummryInMenuPage();

  // 進捗ステータスボタンを追加
  await createAllRadios();

  // 進捗ステータスをストレージから復元
  loadRadioStates();
};

const main = async () => {
  if (
    document.URL.includes("/works/mondai/") &&
    document.URL.includes("/problem_index")
  ) {
    // メニューページ用の要素を作成
    await createElementForMenuPage();
  } else if (
    document.URL.includes("/works/mondai") &&
    countSlash(document.URL) == 4
  ) {
    // メニュー一覧ページ用の要素を作成
    setTimeout(() => {
      createElementForMenuListPage();
    }, WAIT_MSEC_FOR_MENU_LIST_PAGE);
  }
};

const pageShow = async () => {
  if (document.URL.includes("/works/mondai") && countSlash(document.URL) == 4) {
    // メニュー一覧ページ用の要素を作成
    createElementForMenuListPage();
  }
};

window.addEventListener("load", main);
window.addEventListener("pageshow", pageShow); // 戻るボタンで一覧に戻った時にステータスを更新

// clear storage
// chrome.storage.local.clear();
// chrome.storage.sync.clear();
