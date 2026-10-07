from pydantic import BaseModel
from typing import Optional, List

class PatientCreate(BaseModel):
    name: str; age: int; gender: str; village: str; baseline_conditions: Optional[str] = ""

class PatientResponse(BaseModel):
    id: int; name: str; age: int; gender: str; village: str; baseline_conditions: str

class VitalsSubmit(BaseModel):
    patient_id: int
    workflow_type: str
    bp_systolic: float
    bp_diastolic: float
    spO2: float
    temperature: float
    symptoms: List[str]

class ActionSubmit(BaseModel):
    vitals_id: int
    human_action: str

class LoginRequest(BaseModel):
    asha_id: str
    pin: str