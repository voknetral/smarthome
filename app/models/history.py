from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class HistoryCreate(BaseModel):
    event: str
    status: str
    status_class: Optional[str] = "text-green-600"

class HistoryEntry(BaseModel):
    id: int
    event: str
    status: str
    status_class: Optional[str]
    timestamp: datetime
