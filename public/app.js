const STORAGE_KEY = "daily-widget-data-v2";

let widgetDate = null;
let isChecking = false;

async function initializeWidget() {
  const today = await fetchTodayFromServer();

  widgetDate = today;
  loadFromLocalStorage(today);
  bindInputEvents();

  checkDateAndNewCard();

  setInterval(checkDateAndNewCard, 30 * 1000);
}

async function fetchTodayFromServer() {
  const response = await fetch("/api/today");
  const result = await response.json();
  return result.today;
}

function getTodayJSTText() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  return year + "-" + month + "-" + day;
}

function getCurrentFormData() {
  const title = document.getElementById("title").value.trim();

  const itemInputs = document.querySelectorAll("#items input");
  const items = Array.from(itemInputs)
    .map((input) => input.value.trim())
    .filter((text) => text !== "");

  return {
    widgetDate,
    title,
    items,
  };
}

function hasContent(data) {
  return Boolean(data.title) || data.items.length > 0;
}

function saveToLocalStorage() {
  const data = getCurrentFormData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setMessage("一時保存済み");
}

function loadFromLocalStorage(today) {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    widgetDate = today;
    updateDateView();
    return;
  }

  try {
    const data = JSON.parse(raw);

    widgetDate = data.widgetDate || today;
    document.getElementById("title").value = data.title || "";

    renderItems(data.items && data.items.length > 0 ? data.items : [""]);
    updateDateView();

    setMessage("前回の入力内容を復元しました");
  } catch (error) {
    console.error(error);
    widgetDate = today;
    updateDateView();
  }
}

function renderItems(items) {
  const itemsDiv = document.getElementById("items");
  itemsDiv.innerHTML = "";

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <input type="text" placeholder="子項目を入力" value="${escapeHtml(item)}" />
      <button class="remove-button" onclick="removeItem(this)">×</button>
    `;

    itemsDiv.appendChild(div);
  }

  bindInputEvents();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addItem() {
  const items = document.getElementById("items");

  const div = document.createElement("div");
  div.className = "item";

  div.innerHTML = `
    <input type="text" placeholder="子項目を入力" />
    <button class="remove-button" onclick="removeItem(this)">×</button>
  `;

  items.appendChild(div);

  bindInputEvents();
  saveToLocalStorage();
}

function removeItem(button) {
  const items = document.getElementById("items");

  if (items.children.length <= 1) {
    button.parentElement.querySelector("input").value = "";
    saveToLocalStorage();
    return;
  }

  button.parentElement.remove();
  saveToLocalStorage();
}

function resetFormAfterSuccessfulWrite(newDate) {
  widgetDate = newDate;

  document.getElementById("title").value = "";
  document.getElementById("items").innerHTML = `
    <div class="item">
      <input type="text" placeholder="子項目を入力" />
      <button class="remove-button" onclick="removeItem(this)">×</button>
    </div>
  `;

  updateDateView();
  bindInputEvents();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      widgetDate,
      title: "",
      items: [],
    })
  );
}

function updateDateView() {
  document.getElementById("widgetDate").textContent = widgetDate;
}

function setMessage(text) {
  document.getElementById("message").textContent = text;
}

function bindInputEvents() {
  const inputs = document.querySelectorAll("input");

  inputs.forEach((input) => {
    input.oninput = () => {
      saveToLocalStorage();
    };
  });
}

async function writeToNewCard(data, newDate) {
  const response = await fetch("/save-to-date", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetDate: newDate,
      title: data.title,
      items: data.items,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "保存に失敗しました");
  }

  return result;
}

async function checkDateAndNewCard() {
  if (isChecking) return;

  const today = getTodayJSTText();

  if (today === widgetDate) {
    return;
  }

  const currentData = getCurrentFormData();

  if (!hasContent(currentData)) {
    widgetDate = today;
    updateDateView();
    saveToLocalStorage();
    setMessage("入力内容がないため、新しい日付に切り替えました");
    return;
  }

  try {
    isChecking = true;

    setMessage(
      "日付が変わりました。新しいNotionカードが作成されているか確認中..."
    );

    await writeToNewCard(currentData, today);

    resetFormAfterSuccessfulWrite(today);

    setMessage(
      "新しいNotionカードに書き込みました。Widgetをリセットしました。"
    );
  } catch (error) {
    console.error(error);

    setMessage(
      "新しいカードへの書き込み待ちです。入力内容は保持しています。\n" +
        error.message
    );
  } finally {
    isChecking = false;
  }
}

window.addEventListener("load", initializeWidget);