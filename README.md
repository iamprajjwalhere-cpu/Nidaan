# Nidaan: Edge-ML & Generative AI Clinical Sentinel

An offline-first clinical decision support system (triage copilot) engineered for ASHA workers, ANMs, and rural paramedics in zero-connectivity environments. Nidaan transforms passive vital logs into actionable risk trajectories using edge machine learning and constrained Generative AI.

## The Problem & Solution
In rural India, frontline health workers manage thousands of patients, often logging vitals on paper registers. Subtle multi-variable deterioration (like early-stage pre-eclampsia or childhood pneumonia) is frequently missed until it becomes a severe emergency.

**Nidaan** wraps an active interpretation loop around the worker's existing workflow. It captures data locally, runs anomaly detection on the device CPU, and provides explainable AI (XAI) clinical reasoning when internet access is restored—acting strictly as a **Human-in-the-Loop** decision support tool, not an autonomous diagnostic engine.

## Core Architecture & Tech Stack
Designed for resource-constrained hardware (e.g., budget Android tablets running a local Python environment via Termux/Chaquopy), the architecture prioritizes lightweight execution and offline resilience.

* **Frontend:** HTML5, CSS3, Vanilla JS, Chart.js, Web Audio API (`MediaRecorder`)
* **Backend:** Python 3, FastAPI (ASGI)
* **Local Database:** SQLite (configured with `PRAGMA journal_mode=WAL;` for power-loss data integrity)
* **Edge NLP (Voice):** `openai-whisper` (tiny model) + FFmpeg (Local Hinglish audio parsing)
* **Edge ML (Triage):** `scikit-learn` (`IsolationForest` for multi-variable anomaly detection)
* **Cloud AI (XAI):** Google `gemini-2.5-flash` (Constrained RAG pipeline using local Formalized Knowledge Units)

## Key Features
1. **Offline-First Data Capture:** Securely log patient demographics and time-series vitals (BP, SpO2, Temp) directly to the device's local storage.
2. **Smart Voice Dictation (Edge NLP):** Workers can tap a mic and dictate in Hinglish (e.g., *"fever 101 hai aur oxygen 95"*). Local Whisper processing and smart JS Regex map spoken numbers directly to form inputs, eliminating typing fatigue.
3. **Dual-Layer AI Triage:**
   * **Tier 1 (Offline):** `IsolationForest` continuously calculates a multi-variable anomaly index across a 14-visit rolling window, flagging High/Medium/Low risk.
   * **Tier 2 (Online):** When a network is detected, Gemini 2.5 Flash cross-references the anomaly with MoHFW/IMNCI protocols to generate a strict, JSON-formatted, bilingual action checklist.
4. **Automated MoHFW Export:** A local `/api/export` endpoint dynamically queries SQLite to generate government-compliant `.csv` monthly registers, saving hours of manual paperwork.
5. **Bilingual UI:** Native, instant toggle between English and Hindi for maximum accessibility.

## Local Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/iamprajjwalhere-cpu/Nidaan.git](https://github.com/iamprajjwalhere-cpu/Nidaan.git)
   cd Nidaan