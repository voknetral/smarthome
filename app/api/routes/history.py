from fastapi import APIRouter, HTTPException, Depends
from app.db.session import get_cursor
from app.models.history import HistoryCreate, HistoryEntry
from typing import List
from app.api.deps import get_current_user, get_current_admin

router = APIRouter(prefix="/history", tags=["History"])

@router.get("", response_model=List[HistoryEntry])
def get_history(limit: int = 100, current_user: dict = Depends(get_current_user)):
    """Get recent activity history"""
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT id, event, status, status_class, timestamp FROM app_history ORDER BY timestamp DESC LIMIT %s",
                (limit,)
            )
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(500, f"Error fetching history: {e}")

@router.post("")
def add_history(entry: HistoryCreate, current_user: dict = Depends(get_current_user)):
    """Add a new history entry"""
    try:
        with get_cursor() as cur:
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s) RETURNING id",
                (entry.event, entry.status, entry.status_class)
            )
            return {"success": True, "id": cur.fetchone()["id"]}
    except Exception as e:
        raise HTTPException(500, f"Error adding history: {e}")

@router.delete("")
def clear_history(current_admin: dict = Depends(get_current_admin)):
    """Clear all history entries"""
    try:
        with get_cursor() as cur:
            cur.execute("DELETE FROM app_history")
            return {"success": True, "message": "History cleared"}
    except Exception as e:
        raise HTTPException(500, f"Error clearing history: {e}")
