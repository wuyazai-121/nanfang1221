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
const wiringDiagram = document.getElementById("wiringDiagram");
const exportSvgBtn = document.getElementById("exportSvg");
const exportPngBtn = document.getElementById("exportPng");

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
let wiringMeta = { chip: null, wiring: [] };
let lockedSensorKey = null;

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

function escapeDiagramText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMappingLines(mapping, perLine = 2) {
  const items = (mapping || []).map((pair) => `${pair[0]}->${pair[1]}`);
  const lines = [];
  for (let i = 0; i < items.length; i += perLine) {
    lines.push(items.slice(i, i + perLine).join(", "));
  }
  return lines.length ? lines : ["-"];
}

function renderWiringDiagram(chip, wiring) {
  if (!wiringDiagram) {
    return;
  }
  if (!chip || !wiring || wiring.length === 0) {
    wiringDiagram.innerHTML =
      '<div class="diagram-empty">请选择芯片与传感器后生成连线图。</div>';
    wiringMeta = { chip: null, wiring: [] };
    lockedSensorKey = null;
    return;
  }

  const width = 900;
  const leftCount = Math.ceil(wiring.length / 2);
  const rightCount = wiring.length - leftCount;
  const rowHeight = 120;
  const height = Math.max(320, Math.max(leftCount, rightCount) * rowHeight + 80);

  const chipW = 220;
  const chipH = 120;
  const sensorW = 200;
  const sensorH = 72;

  const chipX = width / 2 - chipW / 2;
  const chipY = height / 2 - chipH / 2;
  const stamp = new Date().toLocaleString();
  const titleText = `${chip.model} Wiring Diagram`;

  const parts = [];
  parts.push(
    `<svg viewBox="0 0 ${width} ${height}" class="diagram-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="hardware wiring diagram">`
  );
  parts.push(
    `<style>
      .diagram-node{fill:#ffffff;stroke:#d7e0f0;stroke-width:1.4}
      .diagram-chip{fill:#eef4ff;stroke:#7ea7ff}
      .diagram-line{stroke:#6b7c93;stroke-width:1.4;fill:none;opacity:.8}
      .diagram-text{font-size:13px;fill:#1f2c44;font-weight:600;font-family:Inter,'Noto Sans SC','Segoe UI',sans-serif}
      .diagram-title{font-size:16px;fill:#1f2c44;font-weight:700;font-family:Inter,'Noto Sans SC','Segoe UI',sans-serif}
      .diagram-sub{font-size:11px;fill:#607086;font-family:Inter,'Noto Sans SC','Segoe UI',sans-serif}
      .diagram-label{font-size:10.5px;fill:#1f2c44;font-family:Inter,'Noto Sans SC','Segoe UI',sans-serif}
      .diagram-watermark{font-size:11px;letter-spacing:2px;fill:rgba(31,44,68,0.22);font-weight:700}
    </style>`
  );
  parts.push(
    `<text class="diagram-title" x="40" y="38">${escapeDiagramText(titleText)}</text>`
  );
  parts.push(
    `<text class="diagram-sub" x="40" y="58">${escapeDiagramText(stamp)}</text>`
  );
  parts.push(
    `<rect class="diagram-node diagram-chip" x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="16"></rect>`
  );
  parts.push(
    `<text class="diagram-text" x="${chipX + chipW / 2}" y="${chipY + 46}" text-anchor="middle">${escapeDiagramText(
      chip.model
    )}</text>`
  );
  parts.push(
    `<text class="diagram-sub" x="${chipX + chipW / 2}" y="${chipY + 72}" text-anchor="middle">${escapeDiagramText(
      chip.package || ""
    )}</text>`
  );
  parts.push(
    `<text class="diagram-sub" x="${chipX + chipW / 2}" y="${chipY + 94}" text-anchor="middle">${escapeDiagramText(
      chip.cpu || ""
    )}</text>`
  );

  wiring.forEach((w, index) => {
    const sensorKey = `s${index}`;
    const side = index < leftCount ? "left" : "right";
    const localIndex = side === "left" ? index : index - leftCount;
    const x = side === "left" ? 60 : width - 60 - sensorW;
    const y = 60 + localIndex * rowHeight;

    const startX = side === "left" ? x + sensorW : x;
    const endX = side === "left" ? chipX : chipX + chipW;
    const sensorMidY = y + sensorH / 2;
    const chipTargetY =
      chipY + chipH / 2 + (index - (wiring.length - 1) / 2) * 12;

    parts.push(
      `<g class="diagram-sensor" data-sensor="${sensorKey}">`
    );
    parts.push(
      `<rect class="diagram-node" data-sensor="${sensorKey}" x="${x}" y="${y}" width="${sensorW}" height="${sensorH}" rx="14"></rect>`
    );
    parts.push(
      `<text class="diagram-text" data-sensor="${sensorKey}" x="${x + sensorW / 2}" y="${y + 30}" text-anchor="middle">${escapeDiagramText(
        w.sensor
      )}</text>`
    );
    parts.push(
      `<text class="diagram-sub" data-sensor="${sensorKey}" x="${x + sensorW / 2}" y="${y + 52}" text-anchor="middle">${escapeDiagramText(
        w.interface
      )}</text>`
    );
    parts.push(`</g>`);
    parts.push(
      `<path class="diagram-line" data-sensor="${sensorKey}" d="M ${startX} ${sensorMidY} L ${endX} ${chipTargetY}"></path>`
    );

    const mappingLines = buildMappingLines(w.mapping, 2);
    const labelX = (startX + endX) / 2;
    let labelY =
      (sensorMidY + chipTargetY) / 2 - (mappingLines.length - 1) * 6;
    parts.push(
      `<text class="diagram-label" data-sensor="${sensorKey}" x="${labelX}" y="${labelY}" text-anchor="middle">`
    );
    mappingLines.forEach((line, idx) => {
      parts.push(
        `<tspan x="${labelX}" dy="${idx === 0 ? 0 : 12}">${escapeDiagramText(
          line
        )}</tspan>`
      );
    });
    parts.push(`</text>`);
  });

  parts.push(
    `<text class="diagram-watermark" x="${width - 26}" y="${height - 24}" text-anchor="end">Embed Design</text>`
  );
  parts.push("</svg>");
  wiringDiagram.innerHTML = parts.join("");
  wiringMeta = { chip, wiring };
  lockedSensorKey = null;
  bindDiagramInteractions();
}

function bindDiagramInteractions() {
  const svg = wiringDiagram ? wiringDiagram.querySelector("svg") : null;
  if (!svg) {
    return;
  }
  const items = Array.from(svg.querySelectorAll("[data-sensor]"));
  const setHighlight = (key) => {
    svg.classList.toggle("has-highlight", Boolean(key));
    items.forEach((el) => {
      const match = key && el.dataset.sensor === key;
      el.classList.toggle("is-highlight", Boolean(match));
      el.classList.toggle("is-dim", Boolean(key && !match));
    });
  };
  items.forEach((el) => {
    el.addEventListener("mouseenter", () => {
      if (!lockedSensorKey) {
        setHighlight(el.dataset.sensor);
      }
    });
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      const key = el.dataset.sensor;
      lockedSensorKey = lockedSensorKey === key ? null : key;
      setHighlight(lockedSensorKey);
    });
  });
  svg.addEventListener("mouseleave", () => {
    if (!lockedSensorKey) {
      setHighlight(null);
    }
  });
  svg.addEventListener("click", () => {
    lockedSensorKey = null;
    setHighlight(null);
  });
}

function getDiagramSvg() {
  return wiringDiagram ? wiringDiagram.querySelector("svg") : null;
}

function buildDownloadName(ext) {
  const name = wiringMeta.chip ? wiringMeta.chip.model : "wiring";
  return `${name.replace(/\\s+/g, "_")}.${ext}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportSvg() {
  const svg = getDiagramSvg();
  if (!svg) {
    alert("请先生成连线图。");
    return;
  }
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, buildDownloadName("svg"));
}

async function exportPng() {
  const svg = getDiagramSvg();
  if (!svg) {
    alert("请先生成连线图。");
    return;
  }
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const viewBox = svg.viewBox.baseVal;
    const width = viewBox && viewBox.width ? viewBox.width : svg.clientWidth;
    const height = viewBox && viewBox.height ? viewBox.height : svg.clientHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, buildDownloadName("png"));
        }
      });
    }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("PNG 导出失败，请重试。");
  };
  img.src = url;
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
  renderWiringDiagram(data.chip, data.wiring);
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

if (exportSvgBtn) {
  exportSvgBtn.addEventListener("click", exportSvg);
}
if (exportPngBtn) {
  exportPngBtn.addEventListener("click", exportPng);
}

async function boot() {
  setStatus("加载中...");
  await loadMe();
  await loadData();
  setStatus("在线");
}

boot();
