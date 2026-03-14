from pydantic import BaseModel
from typing import Optional


class SettingsUpdate(BaseModel):
    thresholds: dict
    enable_thresholds: Optional[bool] = True
    alert_cooldown: Optional[int] = 300
    telegram_config: Optional[dict] = None
    mqtt_config: Optional[dict] = None


class TelegramTest(BaseModel):
    bot_token: str
    chat_id: str
    message: str = "Pesan uji otomatis dari sistem Nusa Home. 🚀"
