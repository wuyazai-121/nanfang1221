const statusEl = document.getElementById("status");
const userBadge = document.getElementById("userBadge");
const tabs = document.querySelectorAll(".tab");
const views = {
  home: document.getElementById("view-home"),
  select: document.getElementById("view-select"),
  wiring: document.getElementById("view-wiring"),
  manuals: document.getElementById("view-manuals"),
  admin: document.getElementById("view-admin"),
  account: document.getElementById("view-account"),
};

const globalSearch = document.getElementById("globalSearch");
const searchBtn = document.getElementById("searchBtn");

const hotChips = document.getElementById("hotChips");
const hotSensors = document.getElementById("hotSensors");
const statsChips = document.getElementById("statsChips");
const statsSensors = document.getElementById("statsSensors");

const scenarioInput = document.getElementById("scenario");
const smartSelectBtn = document.getElementById("smartSelect");
const selectResults = document.getElementById("selectResults");

const chipList = document.getElementById("chipList");
const sensorList = document.getElementById("sensorList");

const wiringChip = document.getElementById("wiringChip");
const wiringSensors = document.getElementById("wiringSensors");
const genWiring = document.getElementById("genWiring");
const wiringResult = document.getElementById("wiringResult");

const manualType = document.getElementById("manualType");
const manualTarget = document.getElementById("manualTarget");
const loadManual = document.getElementById("loadManual");
const manualList = document.getElementById("manualList");
const extractPane = document.getElementById("extractPane");

const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const regUser = document.getElementById("regUser");
const regPass = document.getElementById("regPass");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

const adminHint = document.getElementById("adminHint");
const adminChipModel = document.getElementById("adminChipModel");
const adminChipVendor = document.getElementById("adminChipVendor");
const adminChipPackage = document.getElementById("adminChipPackage");
const adminChipVoltageMin = document.getElementById("adminChipVoltageMin");
const adminChipVoltageMax = document.getElementById("adminChipVoltageMax");
const adminChipCpu = document.getElementById("adminChipCpu");
const adminChipFreq = document.getElementById("adminChipFreq");
const adminChipRam = document.getElementById("adminChipRam");
const adminChipFlash = document.getElementById("adminChipFlash");
const adminChipInterfaces = document.getElementById("adminChipInterfaces");
const adminChipScenario = document.getElementById("adminChipScenario");
const adminChipCost = document.getElementById("adminChipCost");
const adminSaveChip = document.getElementById("adminSaveChip");

const adminSensorModel = document.getElementById("adminSensorModel");
const adminSensorType = document.getElementById("adminSensorType");
const adminSensorVendor = document.getElementById("adminSensorVendor");
const adminSensorVoltageMin = document.getElementById("adminSensorVoltageMin");
const adminSensorVoltageMax = document.getElementById("adminSensorVoltageMax");
const adminSensorInterface = document.getElementById("adminSensorInterface");
const adminSensorRange = document.getElementById("adminSensorRange");
const adminSensorAccuracy = document.getElementById("adminSensorAccuracy");
const adminSensorPins = document.getElementById("adminSensorPins");
const adminSensorScenario = document.getElementById("adminSensorScenario");
const adminSaveSensor = document.getElementById("adminSaveSensor");

let token = localStorage.getItem("token") || "";
let currentUser = null;
let chips = [];
let sensors = [];
let selectedNeeds = new Set();
let selectedSensorTypes = new Set();
let selectedSensorIds = new Set();

function setStatus(text) {
  statusEl.textContent = text;
}

function setUserBadge() {
  if (!currentUser) {
    userBadge.textContent = "访客";
    return;
  }
  userBadge.textContent = currentUser.is_admin
    ? `管理员 ${currentUser.username}`
    : currentUser.username;
}

function setView(name) {
  Object.keys(views).forEach((key) => {
    views[key].classList.toggle("active", key === name);
  });
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === name);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

document.querySelectorAll("[data-jump]").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.jump));
});

function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(path, { ...options, headers });
}

function renderHotCards() {
  statsChips.textContent = chips.length;
  statsSensors.textContent = sensors.length;

  hotChips.innerHTML = "";
  chips.slice(0, 3).forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${c.model}</strong><div class="meta">${c.vendor} · ${c.cpu}</div></div>
      <span>${c.freq_mhz}MHz</span>`;
    hotChips.appendChild(card);
  });

  hotSensors.innerHTML = "";
  sensors.slice(0, 3).forEach((s) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${s.model}</strong><div class="meta">${s.type}</div></div>
      <span>${s.interface}</span>`;
    hotSensors.appendChild(card);
  });
}

function renderChipList() {
  chipList.innerHTML = "";
  chips.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${c.model}</strong><div class="meta">${c.vendor} · ${c.package}</div></div>
      <span>${c.voltage_min}-${c.voltage_max}V</span>`;
    chipList.appendChild(card);
  });
}

function renderSensorList() {
  sensorList.innerHTML = "";
  sensors.forEach((s) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${s.model}</strong><div class="meta">${s.type}</div></div>
      <span>${s.interface}</span>`;
    sensorList.appendChild(card);
  });
}

function renderWiringSelectors() {
  wiringChip.innerHTML = "";
  chips.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.model} (${c.cpu})`;
    wiringChip.appendChild(opt);
  });

  wiringSensors.innerHTML = "";
  sensors.forEach((s) => {
    const btn = document.createElement("button");
    btn.textContent = `${s.model} (${s.interface})`;
    btn.onclick = () => {
      if (selectedSensorIds.has(s.id)) {
        selectedSensorIds.delete(s.id);
        btn.classList.remove("active");
      } else {
        selectedSensorIds.add(s.id);
        btn.classList.add("active");
      }
    };
    wiringSensors.appendChild(btn);
  });
}

async function loadData(query = "") {
  setStatus("加载数据中...");
  const [chipRes, sensorRes] = await Promise.all([
    fetch(`/api/chips?q=${encodeURIComponent(query)}`),
    fetch(`/api/sensors?q=${encodeURIComponent(query)}`),
  ]);
  const chipData = await chipRes.json();
  const sensorData = await sensorRes.json();
  chips = chipData.chips || [];
  sensors = sensorData.sensors || [];
  setStatus("在线");
  renderHotCards();
  renderChipList();
  renderSensorList();
  renderWiringSelectors();
  renderManualTargets();
}

function collectPillSelections() {
  selectedNeeds.clear();
  selectedSensorTypes.clear();
  document.querySelectorAll("[data-need].active").forEach((btn) => {
    selectedNeeds.add(btn.dataset.need);
  });
  document.querySelectorAll("[data-sensor].active").forEach((btn) => {
    selectedSensorTypes.add(btn.dataset.sensor);
  });
}

document.querySelectorAll("[data-need]").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
  });
});
document.querySelectorAll("[data-sensor]").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
  });
});

smartSelectBtn.addEventListener("click", async () => {
  collectPillSelections();
  const res = await apiFetch("/api/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario: scenarioInput.value.trim(),
      core_needs: Array.from(selectedNeeds),
      sensor_types: Array.from(selectedSensorTypes),
    }),
  });
  const data = await res.json();
  selectResults.innerHTML = "";
  (data.results || []).forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    const sensorsText = r.sensors.map((s) => s.model).join(", ") || "未指定";
    card.innerHTML = `<div>
        <strong>${r.chip.model}</strong>
        <div class="meta">${r.chip.vendor} · ${r.chip.cpu}</div>
        <div class="meta">传感器: ${sensorsText}</div>
      </div>
      <span>${r.score}分</span>`;
    selectResults.appendChild(card);
  });
});

genWiring.addEventListener("click", async () => {
  const chipId = wiringChip.value;
  const sensorIds = Array.from(selectedSensorIds);
  const res = await apiFetch("/api/wiring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chip_id: Number(chipId), sensor_ids: sensorIds }),
  });
  const data = await res.json();
  wiringResult.innerHTML = "";
  (data.wiring || []).forEach((w) => {
    const card = document.createElement("div");
    card.className = "card";
    const mapping = w.mapping
      .map((pair) => `${pair[0]} → ${pair[1]}`)
      .join("<br/>");
    card.innerHTML = `<div>
        <strong>${w.sensor}</strong>
        <div class="meta">${w.interface}</div>
        <div class="meta">${mapping}</div>
      </div>`;
    wiringResult.appendChild(card);
  });
});

function renderManualTargets() {
  manualTarget.innerHTML = "";
  const list = manualType.value === "chip" ? chips : sensors;
  list.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = manualType.value === "chip" ? item.model : item.model;
    manualTarget.appendChild(opt);
  });
}

manualType.addEventListener("change", renderManualTargets);

loadManual.addEventListener("click", async () => {
  const type = manualType.value;
  const id = manualTarget.value;
  const res = await apiFetch(`/api/manuals?type=${type}&id=${id}`);
  const data = await res.json();
  manualList.innerHTML = "";
  extractPane.innerHTML = "";
  (data.manuals || []).forEach((m) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${m.title}</strong><div class="meta">${m.summary}</div></div>`;
    manualList.appendChild(card);
    const points = JSON.parse(m.key_points || "{}");
    extractPane.innerHTML = `<strong>关键信息</strong>
      <p>引脚: ${(points.pins || []).join(", ")}</p>
      <p>供电: ${points.power || "-"}</p>
      <p>接口: ${points.interfaces || points.protocol || "-"}</p>`;
  });
});

async function login() {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: loginUser.value, password: loginPass.value }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "登录失败");
    return;
  }
  token = data.token;
  localStorage.setItem("token", token);
  await loadMe();
}

async function register() {
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: regUser.value, password: regPass.value }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "注册失败");
    return;
  }
  alert("注册成功，请登录");
}

async function logout() {
  if (token) {
    await apiFetch("/api/logout", { method: "POST" });
  }
  token = "";
  localStorage.removeItem("token");
  currentUser = null;
  setUserBadge();
}

async function loadMe() {
  if (!token) {
    currentUser = null;
    setUserBadge();
    return;
  }
  const res = await apiFetch("/api/me");
  const data = await res.json();
  currentUser = data.user;
  setUserBadge();
  adminHint.textContent = currentUser && currentUser.is_admin ? "管理员已登录" : "管理员登录后才能操作。";
}

adminSaveChip.addEventListener("click", async () => {
  const payload = {
    model: adminChipModel.value,
    vendor: adminChipVendor.value,
    package: adminChipPackage.value,
    voltage_min: adminChipVoltageMin.value,
    voltage_max: adminChipVoltageMax.value,
    cpu: adminChipCpu.value,
    freq_mhz: adminChipFreq.value,
    ram_kb: adminChipRam.value,
    flash_kb: adminChipFlash.value,
    interfaces: adminChipInterfaces.value.split(",").map((s) => s.trim()).filter(Boolean),
    scenario: adminChipScenario.value,
    cost_level: adminChipCost.value,
  };
  await apiFetch("/api/admin/chips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  loadData();
});

adminSaveSensor.addEventListener("click", async () => {
  const payload = {
    model: adminSensorModel.value,
    type: adminSensorType.value,
    vendor: adminSensorVendor.value,
    voltage_min: adminSensorVoltageMin.value,
    voltage_max: adminSensorVoltageMax.value,
    interface: adminSensorInterface.value,
    range_text: adminSensorRange.value,
    accuracy_text: adminSensorAccuracy.value,
    pins: adminSensorPins.value.split(",").map((s) => s.trim()).filter(Boolean),
    scenario: adminSensorScenario.value,
  };
  await apiFetch("/api/admin/sensors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  loadData();
});

loginBtn.addEventListener("click", login);
registerBtn.addEventListener("click", register);
logoutBtn.addEventListener("click", logout);

searchBtn.addEventListener("click", () => {
  loadData(globalSearch.value.trim());
});

async function boot() {
  setStatus("加载中...");
  await loadMe();
  await loadData();
  setStatus("在线");
}

boot();
