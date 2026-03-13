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
        CREATE TABLE IF NOT EXISTS chips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            vendor TEXT NOT NULL,
            package TEXT NOT NULL,
            voltage_min REAL NOT NULL,
            voltage_max REAL NOT NULL,
            cpu TEXT NOT NULL,
            freq_mhz INTEGER NOT NULL,
            ram_kb INTEGER NOT NULL,
            flash_kb INTEGER NOT NULL,
            interfaces TEXT NOT NULL,
            scenario TEXT NOT NULL,
            cost_level INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            type TEXT NOT NULL,
            vendor TEXT NOT NULL,
            voltage_min REAL NOT NULL,
            voltage_max REAL NOT NULL,
            interface TEXT NOT NULL,
            range_text TEXT NOT NULL,
            accuracy_text TEXT NOT NULL,
            pins TEXT NOT NULL,
            scenario TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS manuals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            key_points TEXT NOT NULL
        )
        """
    )

    cur = conn.execute("SELECT COUNT(*) FROM chips")
    if cur.fetchone()[0] == 0:
        chips = [
            (
                "STM32F103C8",
                "ST",
                "LQFP48",
                2.0,
                3.6,
                "Cortex-M3",
                72,
                20,
                64,
                json.dumps(["GPIO", "UART", "I2C", "SPI", "ADC"]),
                "Industrial, IoT",
                2,
            ),
            (
                "ESP32-WROOM",
                "Espressif",
                "QFN48",
                3.0,
                3.6,
                "Xtensa LX6",
                240,
                520,
                4096,
                json.dumps(["GPIO", "UART", "I2C", "SPI", "ADC", "WiFi", "BT"]),
                "Smart Home, IoT",
                3,
            ),
            (
                "ATmega328P",
                "Microchip",
                "DIP28",
                1.8,
                5.5,
                "AVR",
                16,
                2,
                32,
                json.dumps(["GPIO", "UART", "I2C", "SPI", "ADC"]),
                "Education, Basic Control",
                1,
            ),
        ]
        conn.executemany(
            """
            INSERT INTO chips
            (model, vendor, package, voltage_min, voltage_max, cpu, freq_mhz,
             ram_kb, flash_kb, interfaces, scenario, cost_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            chips,
        )

    cur = conn.execute("SELECT COUNT(*) FROM sensors")
    if cur.fetchone()[0] == 0:
        sensors = [
            (
                "BME280",
                "Temperature/Humidity/Pressure",
                "Bosch",
                1.7,
                3.6,
                "I2C",
                "Temp -40~85C, Hum 0~100%RH, Press 300~1100hPa",
                "Temp ±1.0C, Hum ±3%",
                json.dumps(["VCC", "GND", "SDA", "SCL"]),
                "Environment Monitoring",
            ),
            (
                "MPU6050",
                "IMU",
                "TDK",
                2.3,
                3.4,
                "I2C",
                "Accel ±2~16g, Gyro ±250~2000dps",
                "Accel 16-bit, Gyro 16-bit",
                json.dumps(["VCC", "GND", "SDA", "SCL", "INT"]),
                "Robotics, Wearables",
            ),
            (
                "HC-SR04",
                "Ultrasonic",
                "Generic",
                4.5,
                5.5,
                "GPIO",
                "2~400cm",
                "±3mm",
                json.dumps(["VCC", "GND", "TRIG", "ECHO"]),
                "Distance Sensing",
            ),
            (
                "BH1750",
                "Light",
                "ROHM",
                2.4,
                3.6,
                "I2C",
                "1~65535 lux",
                "±20%",
                json.dumps(["VCC", "GND", "SDA", "SCL"]),
                "Lighting Control",
            ),
        ]
        conn.executemany(
            """
            INSERT INTO sensors
            (model, type, vendor, voltage_min, voltage_max, interface,
             range_text, accuracy_text, pins, scenario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            sensors,
        )

    cur = conn.execute("SELECT COUNT(*) FROM manuals")
    if cur.fetchone()[0] == 0:
        manuals = [
            (
                "chip",
                1,
                "STM32F103C8 Reference Manual",
                "Core peripherals, clock tree, GPIO, ADC and communication.",
                json.dumps(
                    {
                        "pins": ["PA9: UART_TX", "PA10: UART_RX", "PB6: I2C_SCL"],
                        "power": "2.0V~3.6V",
                        "interfaces": "GPIO/UART/I2C/SPI/ADC",
                    }
                ),
            ),
            (
                "sensor",
                1,
                "BME280 Datasheet",
                "Environmental sensor with I2C/SPI interface.",
                json.dumps(
                    {
                        "pins": ["VCC", "GND", "SDA", "SCL"],
                        "power": "1.7V~3.6V",
                        "protocol": "I2C 3.4MHz",
                    }
                ),
            ),
        ]
        conn.executemany(
            """
            INSERT INTO manuals
            (target_type, target_id, title, summary, key_points)
            VALUES (?, ?, ?, ?, ?)
            """,
            manuals,
        )

    cur = conn.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1")
    if cur.fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
            ("admin", hash_password("admin", "admin123")),
        )

    conn.commit()
    conn.close()


def rows_to_dicts(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def score_combo(chip, sensors, scenario):
    interfaces = json.loads(chip["interfaces"])
    interface_ok = 1.0
    for s in sensors:
        if s["interface"] not in interfaces:
            interface_ok = 0.0

    perf = min(1.0, (chip["freq_mhz"] / 200) * 0.5 + (chip["ram_kb"] / 512) * 0.3 + (chip["flash_kb"] / 4096) * 0.2)
    scenario_match = 1.0 if scenario and scenario.lower() in chip["scenario"].lower() else 0.6
    cost = (6 - chip["cost_level"]) / 5
    score = 0.4 * interface_ok + 0.3 * perf + 0.2 * scenario_match + 0.1 * cost
    return score


def build_wiring(chip, sensors):
    wiring = []
    for sensor in sensors:
        interface = sensor["interface"]
        if interface == "I2C":
            mapping = [
                ("VCC", "3.3V"),
                ("GND", "GND"),
                ("SDA", "I2C_SDA"),
                ("SCL", "I2C_SCL"),
            ]
        elif interface == "SPI":
            mapping = [
                ("VCC", "3.3V"),
                ("GND", "GND"),
                ("MOSI", "SPI_MOSI"),
                ("MISO", "SPI_MISO"),
                ("SCK", "SPI_SCK"),
                ("CS", "SPI_CS"),
            ]
        elif interface == "UART":
            mapping = [
                ("VCC", "3.3V"),
                ("GND", "GND"),
                ("TX", "UART_RX"),
                ("RX", "UART_TX"),
            ]
        else:
            mapping = [
                ("VCC", "5V/3.3V"),
                ("GND", "GND"),
                ("SIG", "GPIO/ADC"),
            ]
        wiring.append(
            {
                "sensor": sensor["model"],
                "interface": interface,
                "mapping": mapping,
                "notes": "Verify voltage compatibility and address conflicts.",
            }
        )
    return wiring


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
        return query.get("token", [None])[0]

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

    def _handle_api_get(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            if path == "/api/chips":
                term = (query.get("q", [""])[0] or "").lower()
                cur = conn.execute(
                    """
                    SELECT * FROM chips
                    ORDER BY id
                    """
                )
                rows = rows_to_dicts(cur)
                if term:
                    rows = [r for r in rows if term in r["model"].lower() or term in r["vendor"].lower()]
                self._send_json({"chips": rows})
                return

            if path == "/api/sensors":
                term = (query.get("q", [""])[0] or "").lower()
                cur = conn.execute(
                    """
                    SELECT * FROM sensors
                    ORDER BY id
                    """
                )
                rows = rows_to_dicts(cur)
                if term:
                    rows = [r for r in rows if term in r["model"].lower() or term in r["type"].lower()]
                self._send_json({"sensors": rows})
                return

            if path == "/api/manuals":
                target_type = query.get("type", [""])[0]
                target_id = query.get("id", [""])[0]
                if not target_type or not target_id:
                    self._send_json({"manuals": []})
                    return
                cur = conn.execute(
                    """
                    SELECT * FROM manuals
                    WHERE target_type = ? AND target_id = ?
                    """,
                    (target_type, target_id),
                )
                self._send_json({"manuals": rows_to_dicts(cur)})
                return

            if path == "/api/me":
                token = self._get_token()
                user = self._get_user(conn, token)
                self._send_json({"user": user})
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
                if not row or row["password_hash"] != hash_password(username, password):
                    self._send_json({"error": "invalid credentials"}, status=401)
                    return
                token = uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                    (token, row["id"], datetime.now(timezone.utc).isoformat()),
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

        if path == "/api/select":
            scenario = payload.get("scenario", "")
            sensor_types = payload.get("sensor_types", [])
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                chips = rows_to_dicts(conn.execute("SELECT * FROM chips"))
                sensors = rows_to_dicts(conn.execute("SELECT * FROM sensors"))
                selected_sensors = []
                for s_type in sensor_types:
                    for s in sensors:
                        if s_type.lower() in s["type"].lower():
                            selected_sensors.append(s)
                            break
                results = []
                for chip in chips:
                    score = score_combo(chip, selected_sensors, scenario)
                    reasons = [
                        "接口匹配度高",
                        "性能满足需求",
                        "场景适配度良好",
                    ]
                    results.append(
                        {
                            "chip": chip,
                            "sensors": selected_sensors,
                            "score": round(score * 100, 1),
                            "reasons": reasons,
                        }
                    )
                results.sort(key=lambda x: x["score"], reverse=True)
                self._send_json({"results": results[:5]})
                return
            finally:
                conn.close()

        if path == "/api/wiring":
            chip_id = payload.get("chip_id")
            sensor_ids = payload.get("sensor_ids", [])
            if not chip_id:
                self._send_json({"error": "chip_id required"}, status=400)
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                chip = conn.execute("SELECT * FROM chips WHERE id = ?", (chip_id,)).fetchone()
                if not chip:
                    self._send_json({"error": "chip not found"}, status=404)
                    return
                sensors = []
                for sid in sensor_ids:
                    row = conn.execute("SELECT * FROM sensors WHERE id = ?", (sid,)).fetchone()
                    if row:
                        sensors.append(dict(row))
                wiring = build_wiring(dict(chip), sensors)
                self._send_json({"chip": dict(chip), "wiring": wiring})
                return
            finally:
                conn.close()

        if path == "/api/admin/chips":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                user = self._get_user(conn, self._get_token(payload))
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                data = (
                    payload.get("model"),
                    payload.get("vendor"),
                    payload.get("package"),
                    float(payload.get("voltage_min", 0)),
                    float(payload.get("voltage_max", 0)),
                    payload.get("cpu"),
                    int(payload.get("freq_mhz", 0)),
                    int(payload.get("ram_kb", 0)),
                    int(payload.get("flash_kb", 0)),
                    json.dumps(payload.get("interfaces", [])),
                    payload.get("scenario", ""),
                    int(payload.get("cost_level", 3)),
                )
                cur = conn.execute(
                    """
                    INSERT INTO chips
                    (model, vendor, package, voltage_min, voltage_max, cpu, freq_mhz, ram_kb,
                     flash_kb, interfaces, scenario, cost_level)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    data,
                )
                conn.commit()
                self._send_json({"id": cur.lastrowid})
                return
            finally:
                conn.close()

        if path == "/api/admin/sensors":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            try:
                user = self._get_user(conn, self._get_token(payload))
                if not user or not user["is_admin"]:
                    self._send_json({"error": "admin only"}, status=403)
                    return
                data = (
                    payload.get("model"),
                    payload.get("type"),
                    payload.get("vendor"),
                    float(payload.get("voltage_min", 0)),
                    float(payload.get("voltage_max", 0)),
                    payload.get("interface"),
                    payload.get("range_text", ""),
                    payload.get("accuracy_text", ""),
                    json.dumps(payload.get("pins", [])),
                    payload.get("scenario", ""),
                )
                cur = conn.execute(
                    """
                    INSERT INTO sensors
                    (model, type, vendor, voltage_min, voltage_max, interface, range_text,
                     accuracy_text, pins, scenario)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    data,
                )
                conn.commit()
                self._send_json({"id": cur.lastrowid})
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
