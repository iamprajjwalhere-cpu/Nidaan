import os
import json
import sqlite3
import pandas as pd
from sklearn.ensemble import IsolationForest
from dotenv import load_dotenv
from db.init_db import DB_PATH

# --- NEW SDK IMPORTS ---
from google import genai
from google.genai import types

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize the new Client
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

def check_epidemiological_cluster(patient_id: int, conn: sqlite3.Connection):
    village = conn.execute("SELECT village FROM Patient_Demographics WHERE id = ?", (patient_id,)).fetchone()[0]
    df = pd.read_sql_query(f"SELECT p.id, v.temperature FROM Vitals_Time_Series v JOIN Patient_Demographics p ON v.patient_id = p.id JOIN Generated_Anomaly_Score a ON a.vitals_id = v.id WHERE p.village = '{village}' AND a.risk_level IN ('High', 'Medium') AND v.timestamp >= datetime('now', '-2 days')", conn)
    
    if len(df) >= 3:
        print(f"[NIDAAN SENTINEL] Higher-than-usual fever reports in {village}; verify with the PHC/IDSP focal point.")
        return True
    return False

async def process_new_vitals(patient_id: int, vitals_id: int):
    conn = sqlite3.connect(DB_PATH)
    v_data = conn.execute("SELECT workflow_type, symptoms, bp_systolic, bp_diastolic, spO2, temperature FROM Vitals_Time_Series WHERE id = ?", (vitals_id,)).fetchone()
    workflow, symptoms, sys, dia, spo2, temp = v_data

    df = pd.read_sql_query("SELECT bp_systolic, bp_diastolic, spO2, temperature FROM Vitals_Time_Series WHERE patient_id = ? ORDER BY timestamp ASC", conn, params=(patient_id,))
    
    if len(df) < 3:
        anomaly_score, risk_level = 0.5, "Medium"
    else:
        clf = IsolationForest(contamination=0.1, random_state=42).fit(df.values)
        raw_score = clf.decision_function([[sys, dia, spo2, temp]])[0]
        anomaly_score = float(max(0.0, min(1.0, 0.5 - (raw_score * 2.0))))
        risk_level = "High" if anomaly_score > 0.65 else "Medium" if anomaly_score > 0.35 else "Low"

    if risk_level in ["High", "Medium"]: 
        check_epidemiological_cluster(patient_id, conn)

    fku_cursor = conn.execute("SELECT source_agency, fku_payload FROM Knowledge_Units WHERE workflow = ? OR workflow = 'General'", (workflow,))
    fku_context = "\n".join([f"[{agency}] {payload}" for agency, payload in fku_cursor.fetchall()])

    if client and "your_actual_api_key_here" not in GEMINI_API_KEY:
        rationale = _run_xai_loop(patient_id, df, anomaly_score, risk_level, workflow, symptoms, fku_context, conn)
    else:
        rationale = json.dumps({"risk_level": risk_level, "7_day_deterioration_vector": "Unknown", "diagnostic_rationale_en": "Offline Mode. API Key not found.", "prioritized_next_action_en": "Follow standard clinic protocols."})
    
    conn.execute("INSERT INTO Generated_Anomaly_Score (vitals_id, anomaly_score, risk_level, generated_rationale) VALUES (?, ?, ?, ?)", (vitals_id, anomaly_score, risk_level, rationale))
    conn.commit()
    conn.close()

def _run_xai_loop(patient_id, df, score, risk, workflow, symptoms, fku_context, conn):
    pt = conn.execute("SELECT age, gender FROM Patient_Demographics WHERE id = ?", (patient_id,)).fetchone()
    
    system_prompt = """You are a highly experienced, empathetic Chief Medical Officer mentoring a rural ASHA worker in India. 
    Your job is to explain the patient's current condition simply and give clear, actionable next steps based ONLY on the provided FKU protocols.
    DO NOT diagnose independently. DO NOT use complex medical jargon.

    Output strictly as JSON with these exact keys:
    {
      "risk_level": "High|Medium|Low",
      "diagnostic_rationale_en": "Start with a warm, supportive sentence (e.g., 'Good job logging these vitals.'). Explain what the vitals mean simply. Then, provide 2-3 specific, actionable steps using bullet points (e.g., '1. Give ORS. 2. Make them lie on their left side.').",
      "diagnostic_rationale_hi": "Translate the English rationale into simple, conversational Hindi suitable for a rural health worker (e.g., 'नमस्ते, ये वाइटल्स दर्ज करने के लिए धन्यवाद...'). Use numbered bullet points for the steps.",
      "prioritized_next_action_en": "One bold, urgent action step (e.g., 'Urgent PHC Referral' or 'Counsel & Monitor')",
      "prioritized_next_action_hi": "One bold, urgent action step in simple Hindi"
    }"""

    user_prompt = f"Patient: {pt[0]}yo {pt[1]}. Workflow: {workflow}. Symptoms: {symptoms}\nAnomaly Score: {score:.2f}\nFKUs:\n{fku_context}\nVitals:\n{df.tail(3).to_string(index=False)}"

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                temperature=0.3
            )
        )
        return response.text.strip()
    except Exception as e:
        print(f"[XAI Error] {e}")
        return _generate_fallback(risk)

def _generate_fallback(risk):
    return json.dumps({
        "risk_level": risk,
        "diagnostic_rationale_en": "Offline mode active. Anomaly detected in vitals but detailed AI analysis is unavailable without a network connection. Please review the patient's history and symptoms carefully.",
        "diagnostic_rationale_hi": "ऑफ़लाइन मोड सक्रिय। वाइटल्स में विसंगति पाई गई है, लेकिन नेटवर्क कनेक्शन के बिना विस्तृत AI विश्लेषण अनुपलब्ध है। कृपया रोगी के इतिहास और लक्षणों की सावधानीपूर्वक समीक्षा करें।",
        "prioritized_next_action_en": "Assess clinically.",
        "prioritized_next_action_hi": "नैदानिक रूप से आकलन करें।"
    })