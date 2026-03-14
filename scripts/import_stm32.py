import argparse
import json
import os
import sqlite3
import subprocess
import tarfile
import tempfile
import time
from typing import Dict, Iterable, List, Optional

import requests

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "app.db")
TARBALL_URL = "https://api.github.com/repos/embassy-rs/stm32-data-generated/tarball/main"
SOURCES_REPO_URL = "https://github.com/embassy-rs/stm32-data-sources.git"
USER_AGENT = "takeout-web-stm32-import"

CORE_MAP = {
    "cm0": "Cortex-M0",
    "cm0+": "Cortex-M0+",
    "cm0plus": "Cortex-M0+",
    "cm3": "Cortex-M3",
    "cm4": "Cortex-M4",
    "cm4f": "Cortex-M4F",
    "cm7": "Cortex-M7",
    "cm23": "Cortex-M23",
    "cm33": "Cortex-M33",
    "cm55": "Cortex-M55",
    "cm85": "Cortex-M85",
}

FAMILY_FREQ_MHZ = {
    "STM32C0": 48,
    "STM32F0": 48,
    "STM32F1": 72,
    "STM32F2": 120,
    "STM32F3": 72,
    "STM32F4": 180,
    "STM32F7": 216,
    "STM32G0": 64,
    "STM32G4": 170,
    "STM32H5": 250,
    "STM32H7": 480,
    "STM32L0": 32,
    "STM32L1": 32,
    "STM32L4": 80,
    "STM32L4+": 120,
    "STM32L5": 110,
    "STM32U5": 160,
    "STM32WB": 64,
    "STM32WL": 48,
}

DEFAULT_FREQ = 80
DEFAULT_VMIN = 1.7
DEFAULT_VMAX = 3.6
DEFAULT_COST = 3


def download_tarball(dest_path: str, retries: int = 3) -> bool:
    headers = {"User-Agent": USER_AGENT}
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            with requests.get(TARBALL_URL, headers=headers, stream=True, timeout=60) as resp:
                resp.raise_for_status()
                with open(dest_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
            return True
        except Exception as exc:  # pylint: disable=broad-except
            last_err = exc
            time.sleep(2 * attempt)
    print(f"Tarball download failed: {last_err}")
    return False


def iter_chip_json(tar_path: str) -> Iterable[Dict]:
    with tarfile.open(tar_path, "r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            if "/data/chips/" not in member.name:
                continue
            if not member.name.endswith(".json"):
                continue
            f = tar.extractfile(member)
            if not f:
                continue
            try:
                yield json.load(f)
            except json.JSONDecodeError:
                continue


def iter_chip_json_from_dir(root: str) -> Iterable[Dict]:
    chips_dir = os.path.join(root, "data", "chips")
    for dirpath, _, filenames in os.walk(chips_dir):
        for filename in filenames:
            if not filename.endswith(".json"):
                continue
            path = os.path.join(dirpath, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    yield json.load(f)
            except (OSError, json.JSONDecodeError):
                continue


def clone_repo(dest_dir: str) -> bool:
    try:
        subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "https://github.com/embassy-rs/stm32-data-generated.git",
                dest_dir,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def clone_sources_repo(dest_dir: str) -> bool:
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", SOURCES_REPO_URL, dest_dir],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def load_mcufinder_records(sources_dir: Optional[str] = None) -> List[Dict]:
    mcus_path = None
    temp_dir = None
    if sources_dir:
        candidate = os.path.join(sources_dir, "mcufinder", "mcus.json")
        if os.path.isfile(candidate):
            mcus_path = candidate

    if mcus_path is None:
        temp_dir = tempfile.mkdtemp(prefix="stm32-sources-")
        if not clone_sources_repo(temp_dir):
            raise RuntimeError("Failed to clone stm32-data-sources repository.")
        mcus_path = os.path.join(temp_dir, "mcufinder", "mcus.json")

    with open(mcus_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    if temp_dir:
        try:
            for root, dirs, files in os.walk(temp_dir, topdown=False):
                for name in files:
                    os.remove(os.path.join(root, name))
                for name in dirs:
                    os.rmdir(os.path.join(root, name))
            os.rmdir(temp_dir)
        except OSError:
            pass
    return payload.get("MCUs", [])


def find_mcu_for_model(model: str, mcus: List[Dict]) -> Optional[Dict]:
    for mcu in mcus:
        name = mcu.get("name") or ""
        if name.startswith(model):
            return mcu
    return None


def apply_mcu_specs(mcu: Optional[Dict], fallback: Dict[str, object]) -> Dict:
    if not mcu:
        return fallback
    try:
        voltage_min = float(mcu.get("voltageMin") or fallback["voltage_min"])
        voltage_max = float(mcu.get("voltageMax") or fallback["voltage_max"])
        freq = int(float(mcu.get("frequency") or fallback["freq_mhz"]))
        ram = int(float(mcu.get("ram") or fallback["ram_kb"]))
        flash = int(float(mcu.get("flash") or fallback["flash_kb"]))
    except (TypeError, ValueError):
        return fallback
    core = (mcu.get("core") or "").replace("Arm ", "").strip()
    cpu = core or fallback["cpu"]
    return {
        "voltage_min": voltage_min,
        "voltage_max": voltage_max,
        "freq_mhz": freq,
        "ram_kb": ram,
        "flash_kb": flash,
        "cpu": cpu,
    }


def pick_package(packages: List[Dict]) -> str:
    if not packages:
        return "Multiple"
    first = packages[0]
    return first.get("package") or first.get("name") or "Multiple"


def calc_memory_kb(memory_blocks: List[List[Dict]]) -> Dict[str, int]:
    flash = 0
    ram = 0
    for bank in memory_blocks or []:
        for item in bank or []:
            size = int(item.get("size") or 0)
            kind = (item.get("kind") or "").lower()
            if kind == "flash":
                flash += size
            elif kind == "ram":
                ram += size
    return {"flash": max(1, flash // 1024), "ram": max(1, ram // 1024)}


def derive_interfaces(cores: List[Dict]) -> List[str]:
    interfaces = {"GPIO"}
    if not cores:
        return sorted(interfaces)
    peripherals = cores[0].get("peripherals") or []
    names = [str(p.get("name") or "") for p in peripherals]
    if any(n.startswith("I2C") for n in names):
        interfaces.add("I2C")
    if any(n.startswith("SPI") for n in names):
        interfaces.add("SPI")
    if any(n.startswith("USART") or n.startswith("UART") for n in names):
        interfaces.add("UART")
    if any(n.startswith("ADC") for n in names):
        interfaces.add("ADC")
    if any(n.startswith("DAC") for n in names):
        interfaces.add("DAC")
    if any(n.startswith("USB") for n in names):
        interfaces.add("USB")
    if any(n.startswith("CAN") for n in names):
        interfaces.add("CAN")
    if any(n.startswith("ETH") for n in names):
        interfaces.add("ETH")
    if any(n.startswith("SDMMC") or n.startswith("SDIO") for n in names):
        interfaces.add("SDMMC")
    if any(n.startswith("I2S") for n in names):
        interfaces.add("I2S")
    if any(n.startswith("SAI") for n in names):
        interfaces.add("SAI")
    return sorted(interfaces)


def map_cpu(cores: List[Dict]) -> str:
    if not cores:
        return "Cortex-M"
    name = (cores[0].get("name") or "").lower()
    return CORE_MAP.get(name, name.upper() or "Cortex-M")


def import_into_db(db_path: str, sources_dir: Optional[str] = None, update_existing: bool = False) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    try:
        import sys

        sys.path.insert(0, BASE_DIR)
        import server  # type: ignore

        server.init_db()
    except Exception:
        pass
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        existing = {row[0] for row in conn.execute("SELECT model FROM chips")}
        mcus = []
        try:
            mcus = load_mcufinder_records(sources_dir)
        except Exception as exc:  # pylint: disable=broad-except
            print(f"Warning: mcufinder data not available: {exc}")
        to_insert = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tar_path = os.path.join(tmpdir, "stm32-data.tar.gz")
            chips_iter = None
            if download_tarball(tar_path):
                chips_iter = iter_chip_json(tar_path)
            else:
                repo_dir = os.path.join(tmpdir, "stm32-data-generated")
                if not clone_repo(repo_dir):
                    raise RuntimeError("Failed to download STM32 data via tarball or git clone.")
                chips_iter = iter_chip_json_from_dir(repo_dir)

            for chip in chips_iter:
                model = chip.get("name")
                if not model or model in existing:
                    continue
                family = chip.get("family") or "STM32"
                cores = chip.get("cores") or []
                mem = calc_memory_kb(chip.get("memory") or [])
                package = pick_package(chip.get("packages") or [])
                cpu = map_cpu(cores)
                freq = FAMILY_FREQ_MHZ.get(family, DEFAULT_FREQ)
                interfaces = derive_interfaces(cores)
                scenario = f"{family}"
                mcu = find_mcu_for_model(model, mcus) if mcus else None
                fallback = {
                    "voltage_min": DEFAULT_VMIN,
                    "voltage_max": DEFAULT_VMAX,
                    "freq_mhz": freq,
                    "ram_kb": mem["ram"],
                    "flash_kb": mem["flash"],
                    "cpu": cpu,
                }
                specs = apply_mcu_specs(mcu, fallback)
                to_insert.append(
                    (
                        model,
                        "ST",
                        package,
                        specs["voltage_min"],
                        specs["voltage_max"],
                        specs["cpu"],
                        specs["freq_mhz"],
                        specs["ram_kb"],
                        specs["flash_kb"],
                        json.dumps(interfaces),
                        scenario,
                        DEFAULT_COST,
                    )
                )

        if to_insert:
            conn.executemany(
                """
                INSERT INTO chips
                (model, vendor, package, voltage_min, voltage_max, cpu, freq_mhz,
                 ram_kb, flash_kb, interfaces, scenario, cost_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                to_insert,
            )
            conn.commit()
            print(f"Imported {len(to_insert)} STM32 chips.")
        else:
            print("No new STM32 chips to import.")

        if update_existing and mcus:
            updates = []
            rows = conn.execute(
                "SELECT id, model, cpu, freq_mhz, voltage_min, voltage_max, ram_kb, flash_kb FROM chips WHERE model LIKE 'STM32%'"
            ).fetchall()
            for row in rows:
                mcu = find_mcu_for_model(row["model"], mcus)
                if not mcu:
                    continue
                fallback = {
                    "voltage_min": row["voltage_min"],
                    "voltage_max": row["voltage_max"],
                    "freq_mhz": row["freq_mhz"],
                    "ram_kb": row["ram_kb"],
                    "flash_kb": row["flash_kb"],
                    "cpu": row["cpu"],
                }
                specs = apply_mcu_specs(mcu, fallback)
                updates.append(
                    (
                        specs["voltage_min"],
                        specs["voltage_max"],
                        specs["freq_mhz"],
                        specs["ram_kb"],
                        specs["flash_kb"],
                        specs["cpu"],
                        row["id"],
                    )
                )
            if updates:
                conn.executemany(
                    """
                    UPDATE chips
                    SET voltage_min = ?, voltage_max = ?, freq_mhz = ?, ram_kb = ?, flash_kb = ?, cpu = ?
                    WHERE id = ?
                    """,
                    updates,
                )
                conn.commit()
                print(f"Updated {len(updates)} STM32 chip specs from mcufinder data.")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import STM32 chips into app.db")
    parser.add_argument("--db", default=DB_PATH, help="Path to SQLite db")
    parser.add_argument("--sources", default=None, help="Path to stm32-data-sources clone")
    parser.add_argument("--update-existing", action="store_true", help="Update existing STM32 rows")
    args = parser.parse_args()
    import_into_db(args.db, sources_dir=args.sources, update_existing=args.update_existing)


if __name__ == "__main__":
    main()
