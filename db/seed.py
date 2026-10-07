import sqlite3
from db.init_db import DB_PATH, initialize_database

def seed_database():
    initialize_database()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Seed Patients
    if cursor.execute("SELECT COUNT(*) FROM Patient_Demographics").fetchone()[0] == 0:
        patients = [
            ("Priya Sharma (Pregnancy)", 26, "Female", "Wada", "2nd Trimester"),
            ("Aarav (Child)", 2, "Male", "Palghar", "None"),
            ("Mohammed Irfan", 62, "Male", "Wada", "COPD"),
        ]
        for p in patients:
            cursor.execute("INSERT INTO Patient_Demographics (name, age, gender, village, baseline_conditions) VALUES (?, ?, ?, ?, ?)", p)
            
    # 2. Seed Authorized ASHA Workers
    if cursor.execute("SELECT COUNT(*) FROM Auth_Workers").fetchone()[0] == 0:
        workers = [
            ("ASHA-4092", "Sunita Devi", "1234", "Wada"),
            ("ASHA-8173", "Kavita Patil", "1234", "Palghar")
        ]
        for w in workers:
            cursor.execute("INSERT INTO Auth_Workers (asha_id, name, pin_hash, primary_village) VALUES (?, ?, ?, ?)", w)

    # 3. Seed Deterministic FKUs
    if cursor.execute("SELECT COUNT(*) FROM Knowledge_Units").fetchone()[0] == 0:
        fkus = [
            ("General", "Fever", "IDSP Rule: Log fever onset. If unusual clusters form, do not announce outbreak. Verify with PHC/IDSP focal point.", "IDSP Surveillance"),
            ("Child", "Danger Signs", "IMNCI Protocol: If unable to feed, lethargic, or convulsions present with SpO2 < 90%, urgent referral required. Record facility referral.", "WHO/IMNCI"),
            ("Maternal", "Pre-eclampsia", "ANC Protocol: If BP increases across visits and headache/swelling is reported, clinical review required today. Do not diagnose, refer.", "MoHFW ANC"),
        ]
        for f in fkus:
            cursor.execute("INSERT INTO Knowledge_Units (workflow, trigger_symptom, fku_payload, source_agency) VALUES (?, ?, ?, ?)", f)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    seed_database()