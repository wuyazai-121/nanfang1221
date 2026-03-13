const statusEl = document.getElementById("status");
const userBadge = document.getElementById("userBadge");
const tabs = document.querySelectorAll(".tab");
const views = {
  customer: document.getElementById("view-customer"),
  orders: document.getElementById("view-orders"),
  admin: document.getElementById("view-admin"),
  account: document.getElementById("view-account"),
};

const restaurantsEl = document.getElementById("restaurants");
const menuEl = document.getElementById("menu");
const cartEl = document.getElementById("cart");
const itemsTotalEl = document.getElementById("itemsTotal");
const deliveryFeeEl = document.getElementById("deliveryFee");
const grandTotalEl = document.getElementById("grandTotal");
const checkoutBtn = document.getElementById("checkout");
const orderResult = document.getElementById("orderResult");

const addressInput = document.getElementById("address");
const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const useDemoBtn = document.getElementById("useDemo");

const ordersEl = document.getElementById("orders");
const mapCanvas = document.getElementById("mapCanvas");
const mapInfo = document.getElementById("mapInfo");

const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const regUser = document.getElementById("regUser");
const regPass = document.getElementById("regPass");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

const restName = document.getElementById("restName");
const restEta = document.getElementById("restEta");
const restRating = document.getElementById("restRating");
const restLat = document.getElementById("restLat");
const restLng = document.getElementById("restLng");
const restBase = document.getElementById("restBase");
const restPerKm = document.getElementById("restPerKm");
const saveRestaurant = document.getElementById("saveRestaurant");
const resetRestaurant = document.getElementById("resetRestaurant");
const adminRestaurants = document.getElementById("adminRestaurants");

const menuRestaurant = document.getElementById("menuRestaurant");
const menuName = document.getElementById("menuName");
const menuPrice = document.getElementById("menuPrice");
const saveMenu = document.getElementById("saveMenu");
const resetMenu = document.getElementById("resetMenu");
const adminMenu = document.getElementById("adminMenu");

let token = localStorage.getItem("token") || "";
let currentUser = null;
let restaurants = [];
let menuItems = [];
let selectedRestaurant = null;
const cart = new Map();
let editingRestaurantId = null;
let editingMenuId = null;

function fmtMoney(cents) {
  return `CNY ${(cents / 100).toFixed(2)}`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setUserBadge() {
  if (!currentUser) {
    userBadge.textContent = "Guest";
    return;
  }
  userBadge.textContent = currentUser.is_admin ? `Admin: ${currentUser.username}` : currentUser.username;
}

function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(path, { ...options, headers });
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

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dlat = toRad(lat2 - lat1);
  const dlng = toRad(lng2 - lng1);
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlng / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));
  return 6371 * c;
}

function renderRestaurants() {
  restaurantsEl.innerHTML = "";
  if (restaurants.length === 0) {
    restaurantsEl.innerHTML = "<div class='meta'>No restaurants.</div>";
    return;
  }
  restaurants.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    const info = document.createElement("div");
    const distance = r.distance_km ? `${r.distance_km.toFixed(2)} km` : "Set location";
    const fee = r.delivery_fee_cents ? fmtMoney(r.delivery_fee_cents) : "n/a";
    info.innerHTML = `<strong>${r.name}</strong><div class="meta">ETA ${r.eta_min} min · ${r.rating.toFixed(
      1
    )}★ · ${distance} · Fee ${fee}</div>`;
    const btn = document.createElement("button");
    btn.textContent = selectedRestaurant === r.id ? "Selected" : "Select";
    btn.onclick = () => selectRestaurant(r.id);
    card.appendChild(info);
    card.appendChild(btn);
    restaurantsEl.appendChild(card);
  });
}

function renderMenu() {
  menuEl.innerHTML = "";
  if (!selectedRestaurant) {
    menuEl.innerHTML = "<div class='meta'>Select a restaurant first.</div>";
    return;
  }
  menuItems.forEach((m) => {
    const card = document.createElement("div");
    card.className = "card";
    const info = document.createElement("div");
    info.innerHTML = `<strong>${m.name}</strong><div class="meta">${fmtMoney(m.price_cents)}</div>`;
    const btn = document.createElement("button");
    btn.textContent = "Add";
    btn.onclick = () => addToCart(m.id);
    card.appendChild(info);
    card.appendChild(btn);
    menuEl.appendChild(card);
  });
}

function renderCart() {
  cartEl.innerHTML = "";
  let itemsTotal = 0;
  cart.forEach((qty, id) => {
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;
    itemsTotal += item.price_cents * qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `<div><strong>${item.name}</strong><span> x${qty}</span></div><div>${fmtMoney(
      item.price_cents * qty
    )}</div>`;
    cartEl.appendChild(row);
  });
  if (cart.size === 0) {
    cartEl.innerHTML = "<div class='meta'>Cart is empty.</div>";
  }
  itemsTotalEl.textContent = fmtMoney(itemsTotal);
  const deliveryFee = getSelectedDeliveryFee();
  deliveryFeeEl.textContent = fmtMoney(deliveryFee);
  grandTotalEl.textContent = fmtMoney(itemsTotal + deliveryFee);
}

function getSelectedDeliveryFee() {
  const rest = restaurants.find((r) => r.id === selectedRestaurant);
  if (!rest || !rest.delivery_fee_cents) return 0;
  return rest.delivery_fee_cents;
}

async function loadRestaurants() {
  setStatus("Loading restaurants...");
  const lat = latInput.value.trim();
  const lng = lngInput.value.trim();
  const query = lat && lng ? `?lat=${lat}&lng=${lng}` : "";
  const res = await fetch(`/api/restaurants${query}`);
  const data = await res.json();
  restaurants = data.restaurants || [];
  setStatus("Ready");
  renderRestaurants();
  renderMap();
}

async function selectRestaurant(id) {
  selectedRestaurant = id;
  cart.clear();
  renderRestaurants();
  setStatus("Loading menu...");
  const res = await fetch(`/api/menu?restaurant_id=${id}`);
  const data = await res.json();
  menuItems = data.menu || [];
  setStatus("Ready");
  renderMenu();
  renderCart();
  renderMap();
}

function addToCart(menuId) {
  const prev = cart.get(menuId) || 0;
  cart.set(menuId, prev + 1);
  renderCart();
}

function renderMap() {
  mapCanvas.innerHTML = "";
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    mapInfo.textContent = "Set location to estimate";
    return;
  }
  const bounds = restaurants.reduce(
    (acc, r) => {
      acc.minLat = Math.min(acc.minLat, r.lat);
      acc.maxLat = Math.max(acc.maxLat, r.lat);
      acc.minLng = Math.min(acc.minLng, r.lng);
      acc.maxLng = Math.max(acc.maxLng, r.lng);
      return acc;
    },
    { minLat: lat, maxLat: lat, minLng: lng, maxLng: lng }
  );
  const padding = 0.01;
  bounds.minLat -= padding;
  bounds.maxLat += padding;
  bounds.minLng -= padding;
  bounds.maxLng += padding;

  const project = (la, ln) => {
    const x = ((ln - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = (1 - (la - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { x, y };
  };

  const userPoint = project(lat, lng);
  const userMarker = document.createElement("div");
  userMarker.className = "marker user";
  userMarker.style.left = `${userPoint.x}%`;
  userMarker.style.top = `${userPoint.y}%`;
  mapCanvas.appendChild(userMarker);

  restaurants.forEach((r) => {
    const p = project(r.lat, r.lng);
    const marker = document.createElement("div");
    marker.className = "marker restaurant";
    marker.style.left = `${p.x}%`;
    marker.style.top = `${p.y}%`;
    mapCanvas.appendChild(marker);
  });

  if (selectedRestaurant) {
    const rest = restaurants.find((r) => r.id === selectedRestaurant);
    if (rest) {
      const dist = haversine(lat, lng, rest.lat, rest.lng);
      mapInfo.textContent = `Selected restaurant: ${dist.toFixed(2)} km away`;
    }
  } else {
    mapInfo.textContent = "Select a restaurant for distance";
  }
}

useDemoBtn.addEventListener("click", () => {
  latInput.value = "31.2290";
  lngInput.value = "121.4800";
  loadRestaurants();
});

latInput.addEventListener("change", loadRestaurants);
lngInput.addEventListener("change", loadRestaurants);

checkoutBtn.addEventListener("click", async () => {
  if (cart.size === 0) {
    orderResult.textContent = "Cart is empty.";
    return;
  }
  if (!selectedRestaurant) {
    orderResult.textContent = "Select a restaurant.";
    return;
  }
  const items = Array.from(cart.entries()).map(([menu_item_id, qty]) => ({
    menu_item_id,
    qty,
  }));
  orderResult.textContent = "Placing order...";
  const res = await apiFetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      restaurant_id: selectedRestaurant,
      customer_name: currentUser ? currentUser.username : "",
      address: addressInput.value.trim(),
      address_lat: latInput.value.trim(),
      address_lng: lngInput.value.trim(),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    orderResult.textContent = data.error || "Order failed.";
    return;
  }
  cart.clear();
  renderCart();
  orderResult.textContent = `Order #${data.order_id} placed. Total ${fmtMoney(
    data.total_cents
  )}`;
  loadOrders();
});

async function loadOrders() {
  if (!token) {
    ordersEl.innerHTML = "<div class='meta'>Login to view orders.</div>";
    return;
  }
  const res = await apiFetch("/api/orders");
  const data = await res.json();
  if (!res.ok) {
    ordersEl.innerHTML = "<div class='meta'>Failed to load orders.</div>";
    return;
  }
  const orders = data.orders || [];
  if (orders.length === 0) {
    ordersEl.innerHTML = "<div class='meta'>No orders yet.</div>";
    return;
  }
  ordersEl.innerHTML = "";
  orders.forEach((o) => {
    const card = document.createElement("div");
    card.className = "order-card";
    const items = o.items
      .map((i) => `${i.name} x${i.qty}`)
      .join(", ");
    card.innerHTML = `<h4>#${o.id} · ${o.restaurant_name || "Restaurant"}</h4>
      <div class="meta">Items: ${items}</div>
      <div class="meta">Delivery: ${fmtMoney(o.delivery_fee_cents)} · Distance ${
      o.distance_km ? o.distance_km.toFixed(2) : "0.00"
    } km</div>
      <div class="meta">Total: ${fmtMoney(o.total_cents)}</div>`;
    ordersEl.appendChild(card);
  });
}

async function login() {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: loginUser.value.trim(),
      password: loginPass.value,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Login failed");
    return;
  }
  token = data.token;
  localStorage.setItem("token", token);
  await loadMe();
  await loadOrders();
  await loadRestaurants();
}

async function register() {
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: regUser.value.trim(),
      password: regPass.value,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Register failed");
    return;
  }
  alert("Registered. Please login.");
}

async function logout() {
  if (token) {
    await apiFetch("/api/logout", { method: "POST" });
  }
  token = "";
  localStorage.removeItem("token");
  currentUser = null;
  setUserBadge();
  loadOrders();
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
  renderAdminState();
}

function renderAdminState() {
  const adminTab = document.querySelector('[data-view="admin"]');
  if (currentUser && currentUser.is_admin) {
    adminTab.disabled = false;
  } else {
    adminTab.disabled = true;
    if (views.admin.classList.contains("active")) {
      setView("customer");
    }
  }
}

async function loadAdminRestaurants() {
  if (!currentUser || !currentUser.is_admin) return;
  await loadRestaurants();
  adminRestaurants.innerHTML = "";
  restaurants.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${r.name}</strong><div class="meta">${r.eta_min} min · ${r.rating.toFixed(
      1
    )}★</div></div>`;
    const actions = document.createElement("div");
    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.onclick = () => {
      editingRestaurantId = r.id;
      restName.value = r.name;
      restEta.value = r.eta_min;
      restRating.value = r.rating;
      restLat.value = r.lat;
      restLng.value = r.lng;
      restBase.value = r.delivery_base_cents;
      restPerKm.value = r.delivery_per_km_cents;
    };
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = async () => {
      await apiFetch(`/api/admin/restaurants?id=${r.id}`, { method: "DELETE" });
      loadAdminRestaurants();
    };
    actions.appendChild(edit);
    actions.appendChild(del);
    card.appendChild(actions);
    adminRestaurants.appendChild(card);
  });
}

async function loadAdminMenu() {
  if (!currentUser || !currentUser.is_admin) return;
  menuRestaurant.innerHTML = "";
  restaurants.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    menuRestaurant.appendChild(opt);
  });
  if (!menuRestaurant.value && restaurants[0]) {
    menuRestaurant.value = restaurants[0].id;
  }
  const rid = menuRestaurant.value;
  if (!rid) return;
  const res = await fetch(`/api/menu?restaurant_id=${rid}`);
  const data = await res.json();
  const list = data.menu || [];
  adminMenu.innerHTML = "";
  list.forEach((m) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><strong>${m.name}</strong><div class="meta">${fmtMoney(
      m.price_cents
    )}</div></div>`;
    const actions = document.createElement("div");
    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.onclick = () => {
      editingMenuId = m.id;
      menuName.value = m.name;
      menuPrice.value = m.price_cents;
    };
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = async () => {
      await apiFetch(`/api/admin/menu?id=${m.id}`, { method: "DELETE" });
      loadAdminMenu();
      loadRestaurants();
    };
    actions.appendChild(edit);
    actions.appendChild(del);
    card.appendChild(actions);
    adminMenu.appendChild(card);
  });
}

saveRestaurant.addEventListener("click", async () => {
  const payload = {
    name: restName.value.trim(),
    eta_min: restEta.value,
    rating: restRating.value,
    lat: restLat.value,
    lng: restLng.value,
    delivery_base_cents: restBase.value,
    delivery_per_km_cents: restPerKm.value,
  };
  if (editingRestaurantId) {
    payload.id = editingRestaurantId;
    await apiFetch("/api/admin/restaurants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch("/api/admin/restaurants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  editingRestaurantId = null;
  resetRestaurant.click();
  await loadAdminRestaurants();
  await loadAdminMenu();
});

resetRestaurant.addEventListener("click", () => {
  editingRestaurantId = null;
  restName.value = "";
  restEta.value = "";
  restRating.value = "";
  restLat.value = "";
  restLng.value = "";
  restBase.value = "";
  restPerKm.value = "";
});

saveMenu.addEventListener("click", async () => {
  const payload = {
    restaurant_id: menuRestaurant.value,
    name: menuName.value.trim(),
    price_cents: menuPrice.value,
  };
  if (editingMenuId) {
    payload.id = editingMenuId;
    await apiFetch("/api/admin/menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  editingMenuId = null;
  resetMenu.click();
  loadAdminMenu();
  loadRestaurants();
});

resetMenu.addEventListener("click", () => {
  editingMenuId = null;
  menuName.value = "";
  menuPrice.value = "";
});

menuRestaurant.addEventListener("change", loadAdminMenu);

loginBtn.addEventListener("click", login);
registerBtn.addEventListener("click", register);
logoutBtn.addEventListener("click", logout);

async function boot() {
  setStatus("Connecting...");
  await loadMe();
  await loadRestaurants();
  await loadOrders();
  await loadAdminRestaurants();
  await loadAdminMenu();
  setStatus("Online");
}

boot();
