import logging
import sys
from app.core.config import settings

def setup_logging():
    """Configure logging for the application"""
    log_level = logging.INFO if settings.APP_ENV == "production" else logging.DEBUG
    
    # Formatter
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Root Logger
    logger = logging.getLogger()
    logger.setLevel(log_level)

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # You could add FileHandler here if needed
    
    # Quiet down some noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("passlib").setLevel(logging.INFO)
    
    return logger

logger = setup_logging()
