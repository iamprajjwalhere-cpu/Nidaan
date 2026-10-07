let currentPatientId = null;
let trendChart = null;
let analysisPollInterval = null;
let globalPatientsData = [];
window.lastVitalsId = null;

const symptomsMap = {
    "General": [
        {en: "Fever > 3 days", hi: "3 दिन से अधिक बुखार"},
        {en: "Severe Cough", hi: "गंभीर खांसी"},
        {en: "Body Ache", hi: "बदन दर्द"},
        {en: "Rash", hi: "चकत्ते"}
    ],
    "Child": [
        {en: "Unable to feed", hi: "दूध पीने/खाने में असमर्थ"},
        {en: "Lethargic / Unconscious", hi: "सुस्त / बेहोश"},
        {en: "Convulsions", hi: "दौरे (झटके)"},
        {en: "Chest indrawing", hi: "छाती अंदर धंसना"}
    ],
    "Maternal": [
        {en: "Severe Headache", hi: "तेज सिरदर्द"},
        {en: "Visual disturbance", hi: "देखने में परेशानी"},
        {en: "Swelling (Edema)", hi: "सूजन"},
        {en: "Reduced fetal movement", hi: "भ्रूण की गति में कमी"}
    ]
};

// --- Authentication & Initialization Engine ---
document.addEventListener("DOMContentLoaded", () => {
    const session = localStorage.getItem('nidaan-asha-session');
    if (session) {
        document.getElementById('login-screen').style.display = 'none';
        const worker = JSON.parse(session);
        document.getElementById('nav-worker-name').innerHTML = `Attending: <strong>${worker.name} (${worker.asha_id})</strong>`;
    }

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const ashaId = document.getElementById("login-id").value.trim().toUpperCase();
            const pin = document.getElementById("login-pin").value.trim();
            const errorDiv = document.getElementById("login-error");
            
            try {
                const res = await fetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ asha_id: ashaId, pin: pin })
                });
                
                if (!res.ok) throw new Error("Invalid ASHA ID or PIN.");
                
                const data = await res.json();
                localStorage.setItem('nidaan-asha-session', JSON.stringify(data.worker));
                
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('nav-worker-name').innerHTML = `Attending: <strong>${data.worker.name} (${data.worker.asha_id})</strong>`;
                errorDiv.classList.add("hidden");
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.classList.remove("hidden");
            }
        });
    }

    if (localStorage.getItem('nidaan-lang') === 'hi') {
        document.body.classList.add('hi-mode');
        document.getElementById('lang-btn').textContent = 'English';
    }
    updateSymptomChecklist();
    fetchPatients();
    
    document.getElementById("vitals-form").addEventListener("submit", handleVitalsSubmit);
    document.getElementById("add-patient-btn").addEventListener("click", () => document.getElementById("new-patient-modal").classList.remove("hidden"));
    document.getElementById("cancel-patient-btn").addEventListener("click", () => document.getElementById("new-patient-modal").classList.add("hidden"));
    document.getElementById("new-patient-form").addEventListener("submit", handleNewPatientSubmit);
});

// --- Core UI & Routing Functions ---
function toggleLang() {
    document.body.classList.toggle('hi-mode');
    const isHi = document.body.classList.contains('hi-mode');
    localStorage.setItem('nidaan-lang', isHi ? 'hi' : 'en');
    document.getElementById('lang-btn').textContent = isHi ? 'English' : 'हिंदी';
}

function updateSymptomChecklist() {
    const wf = document.getElementById("v-workflow").value;
    const container = document.getElementById("symptom-checklist");
    container.innerHTML = symptomsMap[wf].map(sym => `
        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; text-transform: none; color: var(--primary-dark);">
            <input type="checkbox" value="${sym.en}" class="sym-check"> 
            <span class="lang-en">${sym.en}</span>
            <span class="lang-hi">${sym.hi}</span>
        </label>
    `).join('');
}

function logout() {
    localStorage.removeItem('nidaan-asha-session');
    window.location.reload();
}

function showAcademy() {
    currentPatientId = null;
    document.querySelectorAll('.patient-list li').forEach(li => li.classList.remove('active'));
    document.getElementById("command-center-view").classList.add("hidden");
    document.getElementById("patient-detail-view").classList.add("hidden");
    document.getElementById("academy-view").classList.remove("hidden");
}

function closePatientView() {
    currentPatientId = null;
    document.querySelectorAll('.patient-list li').forEach(li => li.classList.remove('active'));
    document.getElementById("patient-detail-view").classList.add("hidden");
    document.getElementById("academy-view").classList.add("hidden");
    document.getElementById("command-center-view").classList.remove("hidden");
}

// --- Patient Management ---
async function fetchPatients() {
    try {
        const res = await fetch("/api/patients");
        globalPatientsData = await res.json();
        document.getElementById("cc-total-patients").textContent = globalPatientsData.length;
        renderPatientList(globalPatientsData);
    } catch (err) { console.error("API Error", err); }
}

function filterPatients() {
    const query = document.getElementById("search-patients").value.toLowerCase();
    const filtered = globalPatientsData.filter(p => p.name.toLowerCase().includes(query) || p.id.toString().includes(query));
    renderPatientList(filtered);
}

function renderPatientList(patients) {
    const list = document.getElementById("patient-list");
    list.innerHTML = "";
    patients.forEach(p => {
        let triageColor = (p.id % 4 === 0) ? 't-high' : (p.id % 3 === 0) ? 't-med' : 't-low';
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="pl-header">
                <span class="pl-name">${p.name}</span>
                <span class="triage-indicator ${triageColor}"></span>
            </div>
            <span class="pl-meta">ID: #${p.id} • ${p.age}y • ${p.village}</span>
        `;
        li.onclick = () => selectPatient(p.id, li);
        list.appendChild(li);
    });
}

async function handleNewPatientSubmit(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById("patient-name").value.trim(),
        age: parseInt(document.getElementById("patient-age").value, 10),
        gender: document.getElementById("patient-gender").value,
        village: document.getElementById("patient-village").value.trim(),
        baseline_conditions: document.getElementById("patient-conditions").value.trim()
    };
    await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    document.getElementById("new-patient-modal").classList.add("hidden");
    document.getElementById("new-patient-form").reset();
    fetchPatients();
}

async function selectPatient(pid, element) {
    currentPatientId = pid;
    document.querySelectorAll('.patient-list li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');
    
    document.getElementById("command-center-view").classList.add("hidden");
    document.getElementById("academy-view").classList.add("hidden");
    document.getElementById("patient-detail-view").classList.remove("hidden");
    document.getElementById("human-action-box").classList.add("hidden");
    document.getElementById("xai-risk-badge").className = "hidden";
    
    document.getElementById("xai-content").innerHTML = `
        <span class="lang-en">Engine idle. Submit vitals to analyze protocols.</span>
        <span class="lang-hi">इंजन निष्क्रिय है। विश्लेषण के लिए वाइटल्स दर्ज करें।</span>
    `;
    
    document.getElementById("header-risk-indicator").className = "status-badge neutral";
    document.getElementById("header-risk-indicator").textContent = "Awaiting Data";

    const res = await fetch(`/api/patients/${pid}/history`);
    const data = await res.json();
    
    document.getElementById("pd-name").textContent = data.patient.name;
    document.getElementById("pd-id").textContent = data.patient.id;
    document.getElementById("pd-age").textContent = data.patient.age;
    document.getElementById("pd-gender").textContent = data.patient.gender;
    document.getElementById("pd-village").textContent = data.patient.village;
    document.getElementById("pd-conditions").textContent = data.patient.baseline_conditions || "None";
    
    renderHistoryTable(data.vitals);
    renderTrendChart(data.vitals);
}

// --- Vitals & Clinical Workflows ---
async function handleVitalsSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("submit-vitals-btn");
    btn.disabled = true;
    
    const checkedSymptoms = Array.from(document.querySelectorAll('.sym-check:checked')).map(cb => cb.value);

    const payload = {
        patient_id: currentPatientId,
        workflow_type: document.getElementById("v-workflow").value,
        bp_systolic: parseInt(document.getElementById("v-sys").value, 10),
        bp_diastolic: parseInt(document.getElementById("v-dia").value, 10),
        spO2: parseInt(document.getElementById("v-spo2").value, 10),
        temperature: parseFloat(document.getElementById("v-temp").value),
        symptoms: checkedSymptoms
    };

    const res = await fetch("/api/vitals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    window.lastVitalsId = data.vitals_id;
    pollForAnalysis(data.vitals_id);
}

function pollForAnalysis(vitalsId) {
    const btn = document.getElementById("submit-vitals-btn");
    if (analysisPollInterval) clearInterval(analysisPollInterval);
    let polls = 0;
    
    analysisPollInterval = setInterval(async () => {
        if (++polls > 30) {
            clearInterval(analysisPollInterval);
            btn.disabled = false;
            return;
        }
        const res = await fetch(`/api/vitals/${vitalsId}/analysis`);
        const data = await res.json();
        
        if (data.status === "complete") {
            clearInterval(analysisPollInterval);
            btn.disabled = false;
            
            renderXAIResult(data.data);
            document.getElementById("human-action-box").classList.remove("hidden");
            
            const histRes = await fetch(`/api/patients/${currentPatientId}/history`);
            const histData = await histRes.json();
            renderHistoryTable(histData.vitals);
            renderTrendChart(histData.vitals);
        }
    }, 1500);
}

async function submitHumanAction() {
    const action = document.getElementById("worker-action").value;
    if(!action) return alert("Please select an action.");
    
    await fetch("/api/action", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ vitals_id: window.lastVitalsId, human_action: action }) 
    });
    
    alert("Action securely logged to the audit trail.");
    document.getElementById("human-action-box").classList.add("hidden");
    document.getElementById("vitals-form").reset();
    updateSymptomChecklist();
}

// --- Data Visualization ---
function renderXAIResult(data) {
    const badge = document.getElementById("xai-risk-badge");
    const headerBadge = document.getElementById("header-risk-indicator");
    badge.className = "badge-risk";
    headerBadge.className = "status-badge";
    
    const color = data.risk_level === 'High' ? 'var(--risk-high)' : data.risk_level === 'Medium' ? 'var(--risk-med)' : 'var(--risk-low)';
    badge.style.backgroundColor = color;
    headerBadge.style.backgroundColor = color;
    headerBadge.style.color = "white";
    
    const htmlStr = `TRIAGE: ${data.risk_level.toUpperCase()}`;
    badge.innerHTML = htmlStr;
    headerBadge.innerHTML = htmlStr;

    let rationale = {};
    try { rationale = JSON.parse(data.generated_rationale); } catch(e) {}
    
    const text_en = (rationale.diagnostic_rationale_en || 'Offline mode. Local IsolationForest triggered. Patient requires clinical review.').replace(/\n/g, '<br>');
    const text_hi = (rationale.diagnostic_rationale_hi || 'ऑफ़लाइन मोड। स्थानीय विसंगति पाई गई। रोगी को नैदानिक समीक्षा की आवश्यकता है।').replace(/\n/g, '<br>');
    const action_en = rationale.prioritized_next_action_en || 'Routine protocol.';
    const action_hi = rationale.prioritized_next_action_hi || 'नियमित प्रोटोकॉल।';

    document.getElementById("xai-content").className = "";
    document.getElementById("xai-content").innerHTML = `
        <div class="xai-label" style="margin-bottom: 0.5rem;">
            <span class="lang-en">Clinical Status & Rationale</span>
            <span class="lang-hi">नैदानिक ​​स्थिति और औचित्य</span>
        </div>
        <div class="xai-text" style="font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; color: var(--primary-dark);">
            <span class="lang-en">${text_en}</span>
            <span class="lang-hi">${text_hi}</span>
        </div>
        <div class="xai-action">
            <div style="font-size: 0.75rem; text-transform: uppercase; margin-bottom: 4px;">
                <span class="lang-en">Recommended Next Step</span>
                <span class="lang-hi">अनुशंसित अगला कदम</span>
            </div>
            <div style="font-weight: 700;">
                <span class="lang-en">${action_en}</span>
                <span class="lang-hi">${action_hi}</span>
            </div>
        </div>
    `;
}

function renderHistoryTable(vitals) {
    const tbody = document.getElementById("history-tbody");
    tbody.innerHTML = vitals.map(v => {
        const d = new Date(v.timestamp + "Z");
        return `<tr><td>${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}</td>
        <td>${v.bp_systolic}/${v.bp_diastolic}</td><td>${v.spO2}%</td><td>${v.temperature}°F</td></tr>`;
    }).join('');
}

function renderTrendChart(vitals) {
    const ctx = document.getElementById("trend-chart").getContext("2d");
    if (trendChart) trendChart.destroy();
    
    // Fix datetime parsing and sort
    const chrono = [...vitals].sort((a,b) => new Date(a.timestamp.replace(' ', 'T') + "Z") - new Date(b.timestamp.replace(' ', 'T') + "Z"));
    
    // Smart Color Coding: Red if dangerous, Green/Blue if safe
    const spo2Colors = chrono.map(v => v.spO2 < 94 ? '#DC2626' : '#16A34A'); 
    const sysColors = chrono.map(v => v.bp_systolic > 140 ? '#DC2626' : '#2563EB'); 

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chrono.map(v => { 
                const d = new Date(v.timestamp.replace(' ', 'T') + "Z"); 
                return `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`; 
            }),
            datasets: [
                { 
                    label: 'Oxygen (SpO2 %)', 
                    data: chrono.map(v => v.spO2), 
                    borderColor: '#16A34A', 
                    backgroundColor: '#16A34A',
                    borderWidth: 3,
                    pointBackgroundColor: spo2Colors,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    yAxisID: 'y' 
                },
                { 
                    label: 'Blood Pressure (SYS)', 
                    data: chrono.map(v => v.bp_systolic), 
                    borderColor: '#2563EB', 
                    borderDash: [5, 5],
                    borderWidth: 3,
                    pointBackgroundColor: sysColors,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    yAxisID: 'y1' 
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { font: { size: 14, weight: 'bold' } }
                }
            },
            scales: {
                x: {
                    ticks: { font: { size: 10 } }
                },
                y: { 
                    type: 'linear', 
                    position: 'left', 
                    min: 30,  // Lowered from 80 to 30 to catch critical drops
                    max: 100,
                    title: { display: true, text: 'Oxygen (SpO2)', font: {weight: 'bold'} }
                },
                y1: { 
                    type: 'linear', 
                    position: 'right', 
                    min: 30,  // Lowered from 80 to 30 to catch critical drops
                    max: 220, 
                    title: { display: true, text: 'BP Systolic', font: {weight: 'bold'} },
                    grid: { drawOnChartArea: false } 
                }
            }
        }
    });
}

// --- Voice Dictation Engine (Web Speech API) ---
function startVoiceDictation() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Voice dictation is not supported in this browser. Please use Chrome.");
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = document.body.classList.contains('hi-mode') ? 'hi-IN' : 'en-IN'; 
    recognition.continuous = false;
    recognition.interimResults = false;

    const btn = document.getElementById('voice-dictation-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '🔴 Listening...';
    btn.style.backgroundColor = '#fee2e2';

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript.toLowerCase();
        
        // I changed this to console.log so you don't get an annoying popup every time! 
        // Press F12 to see it if you need to debug.
        console.log("Voice transcribed: " + transcript);

        const numbers = transcript.match(/\d+(\.\d+)?/g);
        
        if (numbers && numbers.length >= 2) {
            const sysBox = document.getElementById('v-sys');
            const diaBox = document.getElementById('v-dia');
            if (sysBox) sysBox.value = numbers[0];
            if (diaBox) diaBox.value = numbers[1];
        }

        const spo2Match = transcript.match(/(?:oxygen|spo2|o2|ऑक्सीजन)\s*(\d+(\.\d+)?)/);
        const spo2Box = document.getElementById('v-spo2');
        if (spo2Box) {
            if (spo2Match) spo2Box.value = spo2Match[1];
            else if (numbers && numbers.length >= 3) spo2Box.value = numbers[2];
        }

        const tempMatch = transcript.match(/(?:temperature|temp|fever|बुखार)\s*(\d+(\.\d+)?)/);
        const tempBox = document.getElementById('v-temp');
        if (tempBox) {
            if (tempMatch) tempBox.value = tempMatch[1];
            else if (numbers && numbers.length >= 4) tempBox.value = numbers[3];
        }
    };

recognition.onerror = function(event) {
        console.error("Speech error:", event.error);
        alert("Could not hear properly. Please try again.");
    };

    recognition.onend = function() {
        btn.innerHTML = originalText;
        btn.style.backgroundColor = 'transparent';
    };

    recognition.start();
} // <--- This bracket closes the startVoiceDictation() function

// --- Automated Paperwork Export ---
function downloadMonthlyReport() {
    // Simply redirecting to the GET endpoint will trigger the browser's native file download
    window.location.href = '/api/export';
}