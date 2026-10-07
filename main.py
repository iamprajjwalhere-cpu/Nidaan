from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import aiosqlite
import uvicorn
import json
from db.init_db import initialize_database, DB_PATH
from db.seed import seed_database
from models import PatientCreate, VitalsSubmit, ActionSubmit, LoginRequest
from ml.detector import process_new_vitals
from fastapi.responses import StreamingResponse
import io
import csv
import whisper
from fastapi import UploadFile, File
import tempfile
import os

app = FastAPI(title="Nidaan Clinical Sentinel")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/login")
async def login(req: LoginRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM Auth_Workers WHERE asha_id = ? AND pin_hash = ?", (req.asha_id, req.pin)) as cursor:
            worker = await cursor.fetchone()
            if worker:
                return {"status": "success", "worker": dict(worker)}
            else:
                raise HTTPException(status_code=401, detail="Unauthorized: Invalid ASHA ID or PIN")

@app.get("/api/patients")
async def list_patients():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM Patient_Demographics ORDER BY id DESC") as c:
            return [dict(row) for row in await c.fetchall()]

@app.get("/api/patients/{patient_id}/history")
async def get_patient_history(patient_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM Patient_Demographics WHERE id = ?", (patient_id,)) as c1:
            patient = dict(await c1.fetchone())
        async with db.execute("SELECT * FROM Vitals_Time_Series WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 14", (patient_id,)) as c2:
            vitals = [dict(v) for v in await c2.fetchall()]
            return {"patient": patient, "vitals": vitals}

@app.post("/api/patients")
async def create_patient(patient: PatientCreate):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO Patient_Demographics (name, age, gender, village, baseline_conditions) VALUES (?, ?, ?, ?, ?)",
            (patient.name, patient.age, patient.gender, patient.village, patient.baseline_conditions)
        )
        await db.commit()
        return {"status": "success", "patient_id": cursor.lastrowid}

@app.post("/api/vitals")
async def submit_vitals(vitals: VitalsSubmit, bg_tasks: BackgroundTasks):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO Vitals_Time_Series (patient_id, workflow_type, bp_systolic, bp_diastolic, spO2, temperature, symptoms) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (vitals.patient_id, vitals.workflow_type, vitals.bp_systolic, vitals.bp_diastolic, vitals.spO2, vitals.temperature, json.dumps(vitals.symptoms))
        )
        await db.commit()
        vitals_id = cursor.lastrowid
    bg_tasks.add_task(process_new_vitals, vitals.patient_id, vitals_id)
    return {"status": "success", "vitals_id": vitals_id}

@app.post("/api/action")
async def log_human_action(action: ActionSubmit):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE Vitals_Time_Series SET human_action = ? WHERE id = ?", (action.human_action, action.vitals_id))
        await db.commit()
    return {"status": "Action logged successfully"}

@app.get("/api/vitals/{vitals_id}/analysis")
async def get_analysis(vitals_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM Generated_Anomaly_Score WHERE vitals_id = ?", (vitals_id,)) as cur:
            row = await cur.fetchone()
            if not row: return {"status": "pending"}
            return {"status": "complete", "data": dict(row)}

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/", StaticFiles(directory="templates", html=True), name="html")

import sqlite3

# --- Automated Paperwork Generator ---
@app.get("/api/export")
async def export_monthly_report():
    # 1. Open a fresh connection to your SQLite database
    conn = sqlite3.connect("nidaan.db") 
    cursor = conn.cursor()
    
    query = """
        SELECT p.id, p.name, p.age, p.gender, p.village, 
               v.timestamp, v.workflow_type, v.bp_systolic, v.bp_diastolic, v.spO2, v.temperature, v.symptoms
        FROM Patient_Demographics p
        LEFT JOIN Vitals_Time_Series v ON p.id = v.patient_id
        ORDER BY p.village, v.timestamp DESC
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    # 2. Close the connection since we have our data
    conn.close()
    
    # 3. Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write the official MoHFW-style headers
    writer.writerow([
        "Patient ID", "Full Name", "Age", "Gender", "Village/Ward", 
        "Date & Time", "Clinical Workflow", "BP Sys", "BP Dia", "SpO2 (%)", "Temp (°F)", "Symptoms Logged"
    ])
    
    # Write the data rows
    for row in rows:
        writer.writerow(row)
        
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]), 
        media_type="text/csv", 
        headers={"Content-Disposition": "attachment; filename=Nidaan_Monthly_Register.csv"}
    )

if __name__ == "__main__":
    initialize_database()
    seed_database()
    uvicorn.run("main:app", host="0.0.0.0", port=8000)