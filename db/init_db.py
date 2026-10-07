import sqlite3
import os

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "nidaan_health.db")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS Patient_Demographics (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    age                 INTEGER NOT NULL,
    gender              TEXT    NOT NULL,
    village             TEXT    DEFAULT 'Primary Care Center',
    baseline_conditions TEXT    DEFAULT '',
    abdm_sync_status    INTEGER DEFAULT 0,
    created_at          TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Vitals_Time_Series (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      INTEGER NOT NULL,
    timestamp       TEXT    DEFAULT (datetime('now')),
    workflow_type   TEXT    DEFAULT 'General',
    bp_systolic     REAL    NOT NULL,
    bp_diastolic    REAL    NOT NULL,
    spO2            REAL    NOT NULL,
    temperature     REAL    NOT NULL,
    symptoms        TEXT    DEFAULT '[]',
    human_action    TEXT    DEFAULT 'Pending',
    abdm_sync_status INTEGER DEFAULT 0,
    FOREIGN KEY (patient_id) REFERENCES Patient_Demographics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Generated_Anomaly_Score (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    vitals_id            INTEGER NOT NULL,
    anomaly_score        REAL    NOT NULL,
    risk_level           TEXT    NOT NULL,
    generated_rationale  TEXT    DEFAULT '{}',
    created_at           TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (vitals_id) REFERENCES Vitals_Time_Series(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Knowledge_Units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow        TEXT    NOT NULL,
    trigger_symptom TEXT    NOT NULL,
    fku_payload     TEXT    NOT NULL,
    source_agency   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS Auth_Workers (
    asha_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    primary_village TEXT NOT NULL
);
"""

def initialize_database() -> str:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    conn.close()
    return DB_PATH

if __name__ == "__main__":
    initialize_database()