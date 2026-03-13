import json
import os
import sqlite3
import hashlib
import uuid
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DB_PATH = os.path.join(BASE_DIR, "data", "app.db")


def hash_password(username, password):
    raw = f"{username}:{password}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS restaurants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            eta_min INTEGER NOT NULL,
            rating REAL NOT NULL,
            lat REAL NOT NULL DEFAULT 31.2304,
            lng REAL NOT NULL DEFAULT 121.4737,
            delivery_base_cents INTEGER NOT NULL DEFAULT 300,
            delivery_per_km_cents INTEGER NOT NULL DEFAULT 120
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price_cents INTEGER NOT NULL,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            customer_name TEXT,
            address TEXT,
            total_cents INTEGER NOT NULL,
            user_id INTEGER,
            restaurant_id INTEGER,
            distance_km REAL DEFAULT 0,
            delivery_fee_cents INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            menu_item_id INTEGER NOT NULL,
            qty INTEGER NOT NULL,
            price_cents INTEGER NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
        """
    )

    cur = conn.execute("SELECT COUNT(*) FROM restaurants")
    count = cur.fetchone()[0]
    if count == 0:
        restaurants = [
            ("Noodle House", 25, 4.6, 31.2304, 121.4737, 300, 120),
            ("Rice Bowl", 30, 4.3, 31.2205, 121.4552, 300, 110),
            ("Grill Hub", 35, 4.7, 31.2407, 121.4919, 400, 130),
        ]
        conn.executemany(
            """
            INSERT INTO restaurants
            (name, eta_min, rating, lat, lng, delivery_base_cents, delivery_per_km_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            restaurants,
        )
        items = [
            (1, "Beef Noodles", 2600),
            (1, "Tomato Egg Noodles", 1800),
            (1, "Spicy Wontons", 1600),
            (2, "Chicken Rice", 2200),
            (2, "Pork Rice", 2400),
            (2, "Veggie Rice", 1700),
            (3, "Grilled Chicken", 2800),
            (3, "BBQ Pork", 3000),
            (3, "Mixed Grill", 3600),
        ]
        conn.executemany(
            "INSERT INTO menu_items (restaurant_id, name, price_cents) VALUES (?, ?, ?)",
            items,
        )

    cur = conn.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1")
    admin_count = cur.fetchone()[0]
    if admin_count == 0:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
            ("admin", hash_password("admin", "admin123")),
        )

    conn.commit()
    conn.close()


def rows_to_dicts(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def haversine_km(lat1, lng1, lat2, lng2):
    from math import radians, cos, sin, asin, sqrt

    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(
        dlng / 2
    ) ** 2
    c = 2 * asin(sqrt(a))
    return 6371.0 * c


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b""
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def _get_token(self, payload=None):
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth.split(" ", 1)[1].strip()
        if payload and isinstance(payload, dict):
            token = payload.get("token")
            if token:
                return token
        query = parse_qs(urlparse(self.path).query)
        token = query.get("token", [None])[0]
        return token

    def _get_user(self, conn, token):
        if not token:
            return None
        cur = conn.execute(
            """
            SELECT u.id, u.username, u.is_admin
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._handle_api_get()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._handle_api_post()
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._handle_api_put()
            return
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._handle_api_delete()
            return
        self.send_error(404, "Not Found")

    def _handle_api_get(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            if path == "/api/restaurants":
                lat = query.get("lat", [None])[0]
                lng = query.get("lng", [None])[0]
                cur = conn.execute(
                    """
                    SELECT id, name, eta_min, rating, lat, lng,
                           delivery_base_cents, delivery_per_km_cents
                    FROM restaurants
                    ORDER BY id
                    """
                )
                restaurants = rows_to_dicts(cur)
                if lat is not None and lng is not None:
                    try:
                        lat = float(lat)
                        lng = float(lng)
                        for r in restaurants:
                            dist = haversine_km(lat, lng, r["lat"], r["lng"])
                            fee = r["delivery_base_cents"] + int(
                                r["delivery_per_km_cents"] * dist
                            )
                            r["distance_km"] = dist
                            r["delivery_fee_cents"] = fee
                        restaurants.sort(key=lambda x: x.get("distance_km", 0))
                    except ValueError:
                        pass
                self._send_json({"restaurants": restaurants})
                return

            if path == "/api/menu":
                rid = query.get("restaurant_id", [None])[0]
                if not rid:
                    self._send_json({"error": "restaurant_id required"}, status=400)
                    return
                cur = conn.execute(
                    """
                    SELECT id, restaurant_id, name, price_cents
                    FROM menu_items
                    WHERE restaurant_id = ?
                    ORDER BY id
                    """,
                    (rid,),
                )
                self._send_json({"menu": rows_to_dicts(cur)})
                return

            if path == "/api/me":
                token = self._get_token()
                user = self._get_user(conn, token)
                if not user:
                    self._send_json({"user": None})
                    return
                self._send_json({"user": user})
                return

            if path == "/api/orders":
                token = self._get_token()
                user = self._get_user(conn, token)
                if not user:
                    self._send_json({"error": "unauthorized"}, status=401)
                    return
                cur = conn.execute(
                    """
                    SELECT o.id, o.created_at, o.total_cents, o.delivery_fee_cents,
                           o.distance_km, o.address, o.customer_name,
                           r.name AS restaurant_name
                    FROM orders o
                    LEFT JOIN restaurants r ON r.id = o.restaurant_id
                    WHERE o.user_id = ?
                    ORDER BY o.id DESC
                    """,
                    (user["id"],),
                )
                orders = rows_to_dicts(cur)
                for order in orders:
                    cur = conn.execute(
                        """
                        SELECT oi.qty, oi.price_cents, m.name
                        FROM order_items oi
                        JOIN menu_items m ON m.id = oi.menu_item_id
                        WHERE oi.order_id = ?
                        """,
                        (order["id"],),
                    )
                    order["items"] = rows_to_dicts(cur)
                self._send_json({"orders": orders})
                return

            self._send_json({"error": "Not Found"}, status=404)
        finally:
            conn.close()

    def _handle_api_post(self):
        parsed = urlparse(self.path)
        path = parsed.path

        payload = self._read_json()
        if payload is None:
            self._send_json({"error": "Invalid JSON"}, status=400)
            return

        if path == "/api/register":
            username = (payload.get("username") or "").strip()
            password = payload.get("password") or ""
            if not username or not password:
                self._send_json({"error": "username and password required"}, status=400)
                return
            conn = sqlite3.connect(DB_PATH)
            try:
                conn.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, hash_password(username, password)),
                )
                conn.commit()
                self._send_json({"ok": True})
                return
            except sqlite3.IntegrityError:
                self._send_json({"error": "username already exists"}, status=400)
                return
            finally:
                conn.close()

        if path == "/api/login":
            username = (payload.get("username") or "").strip()
            password = payload.get("password") or ""
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                cur = conn.execute(
                    "SELECT id, password_hash, is_admin FROM users WHERE username = ?",
                    (username,),
                )
                row = cur.fetchone()
                if not row:
                    self._send_json({"error": "invalid credentials"}, status=401)
                    return
                if row["password_hash"] != hash_password(username, password):
                    self._send_json({"error": "invalid credentials"}, status=401)
                    return
                token = uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                    (
                        token,
                        row["id"],
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
                conn.commit()
                self._send_json(
                    {"token": token, "user": {"username": username, "is_admin": row["is_admin"]}}
                )
                return
            finally:
                conn.close()

        if path == "/api/logout":
            token = self._get_token(payload)
            if not token:
                self._send_json({"ok": True})
                return
            conn = sqlite3.connect(DB_PATH)
            try:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()
                self._send_json({"ok": True})
                return
            finally:
                conn.close()

        if path == "/api/order":
            items = payload.get("items", [])
            restaurant_id = payload.get("restaurant_id")
            if not isinstance(items, list) or len(items) == 0:
                self._send_json({"error": "items required"}, status=400)
                return
            if not restaurant_id:
                self._send_json({"error": "restaurant_id required"}, status=400)
                return

            customer_name = payload.get("customer_name", "")
            address = payload.get("address", "")
            address_lat = payload.get("address_lat")
            address_lng = payload.get("address_lng")

            conn = sqlite3.connect(DB_PATH)
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.row_factory = sqlite3.Row
            try:
                token = self._get_token(payload)
                user = self._get_user(conn, token)
                total = 0
                normalized = []
                for item in items:
                    menu_id = item.get("menu_item_id")
                    qty = item.get("qty", 1)
                    if not menu_id or qty <= 0:
                        self._send_json({"error": "invalid item"}, status=400)
                        return
                    cur = conn.execute(
                        "SELECT price_cents FROM menu_items WHERE id = ? AND restaurant_id = ?",
                        (menu_id, restaurant_id),
                    )
                    row = cur.fetchone()
                    if not row:
                        self._send_json({"error": "menu item not found"}, status=404)
                        return
                    price_cents = row[0]
                    total += price_cents * qty
                    normalized.append((menu_id, qty, price_cents))

                cur = conn.execute(
                    """
                    SELECT lat, lng, delivery_base_cents, delivery_per_km_cents
                    FROM restaurants
                    WHERE id = ?
                    """,
                    (restaurant_id,),
                )
                rest = cur.fetchone()
                distance_km = 0.0
                delivery_fee = 0
                if rest and address_lat is not None and address_lng is not None:
                    try:
                        distance_km = haversine_km(
                            float(address_lat),
                            float(address_lng),
                            float(rest["lat"]),
                            float(rest["lng"]),
                        )
                        delivery_fee = int(
                            rest["delivery_base_cents"]
                            + rest["delivery_per_km_cents"] * distance_km
                        )
                    except ValueError:
                        distance_km = 0.0
                        delivery_fee = int(rest["delivery_base_cents"])
                elif rest:
                    delivery_fee = int(rest["delivery_base_cents"])

                total_with_fee = total + delivery_fee
                created_at = datetime.now(timezone.utc).isoformat()
                cur = conn.execute(
                    """
                    INSERT INTO orders
                    (created_at, customer_name, address, total_cents, user_id,
                     restaurant_id, distance_km, delivery_fee_cents)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        created_at,
                        customer_name,
                        address,
                        total_with_fee,
                        user["id"] if user else None,
                        restaurant_id,
                        distance_km,
                        delivery_fee,
                    ),
                )
                order_id = cur.lastrowid
                conn.executemany(
                    """
                    INSERT INTO order_items (order_id, menu_item_id, qty, price_cents)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(order_id, mid, qty, price) for (mid, qty, price) in normalized],
                )
                conn.commit()
                self._send_json(
                    {
                        "order_id": order_id,
                        "total_cents": total_with_fee,
                        "delivery_fee_cents": delivery_fee,
                        "distance_km": distance_km,
                    }
                )
                return
            finally:
                conn.close()

        if path == "/api/admin/restaurants":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                token = self._get_token(payload)
                user = self._get_user(conn, token)
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                name = (payload.get("name") or "").strip()
                if not name:
                    self._send_json({"error": "name required"}, status=400)
                    return
                eta_min = int(payload.get("eta_min", 30))
                rating = float(payload.get("rating", 4.0))
                lat = float(payload.get("lat", 31.2304))
                lng = float(payload.get("lng", 121.4737))
                base_fee = int(payload.get("delivery_base_cents", 300))
                per_km = int(payload.get("delivery_per_km_cents", 120))
                cur = conn.execute(
                    """
                    INSERT INTO restaurants
                    (name, eta_min, rating, lat, lng, delivery_base_cents, delivery_per_km_cents)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (name, eta_min, rating, lat, lng, base_fee, per_km),
                )
                conn.commit()
                self._send_json({"id": cur.lastrowid})
                return
            finally:
                conn.close()

        if path == "/api/admin/menu":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                token = self._get_token(payload)
                user = self._get_user(conn, token)
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                restaurant_id = payload.get("restaurant_id")
                name = (payload.get("name") or "").strip()
                price_cents = int(payload.get("price_cents", 0))
                if not restaurant_id or not name or price_cents <= 0:
                    self._send_json({"error": "invalid menu data"}, status=400)
                    return
                cur = conn.execute(
                    """
                    INSERT INTO menu_items (restaurant_id, name, price_cents)
                    VALUES (?, ?, ?)
                    """,
                    (restaurant_id, name, price_cents),
                )
                conn.commit()
                self._send_json({"id": cur.lastrowid})
                return
            finally:
                conn.close()

        self._send_json({"error": "Not Found"}, status=404)

    def _handle_api_put(self):
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._read_json()
        if payload is None:
            self._send_json({"error": "Invalid JSON"}, status=400)
            return
        if path == "/api/admin/restaurants":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                token = self._get_token(payload)
                user = self._get_user(conn, token)
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                rid = payload.get("id")
                if not rid:
                    self._send_json({"error": "id required"}, status=400)
                    return
                conn.execute(
                    """
                    UPDATE restaurants
                    SET name = ?, eta_min = ?, rating = ?, lat = ?, lng = ?,
                        delivery_base_cents = ?, delivery_per_km_cents = ?
                    WHERE id = ?
                    """,
                    (
                        payload.get("name"),
                        int(payload.get("eta_min", 30)),
                        float(payload.get("rating", 4.0)),
                        float(payload.get("lat", 31.2304)),
                        float(payload.get("lng", 121.4737)),
                        int(payload.get("delivery_base_cents", 300)),
                        int(payload.get("delivery_per_km_cents", 120)),
                        rid,
                    ),
                )
                conn.commit()
                self._send_json({"ok": True})
                return
            finally:
                conn.close()
        if path == "/api/admin/menu":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                token = self._get_token(payload)
                user = self._get_user(conn, token)
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                mid = payload.get("id")
                if not mid:
                    self._send_json({"error": "id required"}, status=400)
                    return
                conn.execute(
                    """
                    UPDATE menu_items
                    SET name = ?, price_cents = ?
                    WHERE id = ?
                    """,
                    (
                        payload.get("name"),
                        int(payload.get("price_cents", 0)),
                        mid,
                    ),
                )
                conn.commit()
                self._send_json({"ok": True})
                return
            finally:
                conn.close()
        self._send_json({"error": "Not Found"}, status=404)

    def _handle_api_delete(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        token = self._get_token()

        if path == "/api/admin/restaurants":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                user = self._get_user(conn, token)
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                rid = query.get("id", [None])[0]
                if not rid:
                    self._send_json({"error": "id required"}, status=400)
                    return
                conn.execute("DELETE FROM restaurants WHERE id = ?", (rid,))
                conn.commit()
                self._send_json({"ok": True})
                return
            finally:
                conn.close()

        if path == "/api/admin/menu":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                user = self._get_user(conn, token)
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                mid = query.get("id", [None])[0]
                if not mid:
                    self._send_json({"error": "id required"}, status=400)
                    return
                conn.execute("DELETE FROM menu_items WHERE id = ?", (mid,))
                conn.commit()
                self._send_json({"ok": True})
                return
            finally:
                conn.close()

        self._send_json({"error": "Not Found"}, status=404)


def main():
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    try:
        port = int(os.environ.get("PORT", "8000"))
    except ValueError:
        port = 8000
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Server running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
