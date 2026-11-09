import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATA_DIR = ROOT / "backend" / "data"
MODEL_DIR = ROOT / "backend" / "models"
DATABASE_PATH = DATA_DIR / "aerotwin.db"
TELEMETRY_INTERVAL = float(os.getenv("TELEMETRY_INTERVAL", "1.0"))
MAX_HISTORY = int(os.getenv("MAX_HISTORY", "900"))
ENGINE_ID = os.getenv("ENGINE_ID", "APT-MALE-SIM-01")
FLEET_ENGINE_IDS = (
    ENGINE_ID,
    f"{ENGINE_ID.rsplit('-', 1)[0]}-02",
    f"{ENGINE_ID.rsplit('-', 1)[0]}-03",
)

for directory in (DATA_DIR, MODEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)
