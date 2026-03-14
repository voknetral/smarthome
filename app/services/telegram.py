import httpx
import logging
import asyncio
from app.db.session import get_cursor

logger = logging.getLogger("TelegramService")

async def send_telegram_notification(message: str):
    """
    Send a message to Telegram using the bot and chat ID configured in the database.
    """
    try:
        def get_config():
            with get_cursor() as cur:
                cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'telegram_config'")
                row = cur.fetchone()
                if not row:
                    return None
                return row['setting_value']

        config = await asyncio.to_thread(get_config)
        
        if not config:
            logger.warning("Telegram config not found in database")
            return False
            
        if not config.get('enabled'):
            return False
        
        bot_token = config.get('bot_token')
        chat_id = config.get('chat_id')
        
        if not bot_token or not chat_id:
            logger.warning("Telegram botToken or chatId missing in config")
            return False
        
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                logger.error(f"Telegram API error: {response.status_code} - {response.text}")
                return False
            
            logger.info(f"Telegram sent successfully to {chat_id}")
            return True
            
    except Exception as e:
        logger.error(f"Failed to send Telegram notification: {e}")
        return False
