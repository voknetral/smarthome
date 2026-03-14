from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.services.telegram import send_telegram_notification
from app.api.deps import get_current_user

router = APIRouter(prefix="/notify", tags=["Notifications"])

class TelegramMessage(BaseModel):
    message: str

@router.post("/telegram/send")
async def send_manual_telegram(data: TelegramMessage, current_user: dict = Depends(get_current_user)):
    """
    Send a manual notification to the configured Telegram bot.
    """
    success = await send_telegram_notification(data.message)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send Telegram notification")
    
    return {"success": True, "message": "Notification sent successfully"}
