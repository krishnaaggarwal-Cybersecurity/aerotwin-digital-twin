"""Small SQLite persistence layer; intentionally dependency-free for local demos."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .config import DATABASE_PATH


SCHEMA = """
CREATE TABLE IF NOT EXISTS engines (
  engine_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, metadata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, engine_id TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_engine_time ON telemetry(engine_id, timestamp DESC);
CREATE TABLE IF NOT EXISTS fault_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, engine_id TEXT NOT NULL,
  fault TEXT NOT NULL, severity TEXT NOT NULL, details TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, engine_id TEXT NOT NULL,
  predicted_fault TEXT NOT NULL, confidence REAL NOT NULL, probabilities TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, engine_id TEXT NOT NULL,
  reliability REAL NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, engine_id TEXT NOT NULL,
  severity TEXT NOT NULL, message TEXT NOT NULL, details TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS maintenance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, engine_id TEXT NOT NULL,
  priority TEXT NOT NULL, recommendation TEXT NOT NULL, reason TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path=DATABASE_PATH):
        self.path = path

    def _connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self, engine_id: str) -> None:
        with self._connection() as con:
            con.executescript(SCHEMA)
            con.execute(
                "INSERT OR IGNORE INTO engines(engine_id, created_at, metadata) VALUES (?, datetime('now'), ?)",
                (engine_id, json.dumps({"scope": "generic aero piston engine", "synthetic": True})),
            )

    def save_telemetry(self, record: dict[str, Any]) -> None:
        with self._connection() as con:
            con.execute(
                "INSERT INTO telemetry(timestamp, engine_id, payload) VALUES (?, ?, ?)",
                (record["timestamp"], record["engine_id"], json.dumps(record)),
            )

    def telemetry_history(self, limit: int = 300) -> list[dict[str, Any]]:
        with self._connection() as con:
            rows = con.execute("SELECT payload FROM telemetry ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [json.loads(row["payload"]) for row in reversed(rows)]

    def event(self, table: str, values: dict[str, Any]) -> None:
        allowed = {"fault_events", "predictions", "missions", "alerts", "maintenance_events"}
        if table not in allowed:
            raise ValueError("unsupported event table")
        columns, values_list = zip(*values.items())
        placeholders = ", ".join("?" for _ in columns)
        with self._connection() as con:
            con.execute(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})", values_list)

    def alerts(self, limit: int = 30) -> list[dict[str, Any]]:
        with self._connection() as con:
            rows = con.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(row) for row in rows]

    def acknowledge_alert(self, alert_id: int) -> bool:
        with self._connection() as con:
            cursor = con.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
        return cursor.rowcount > 0
