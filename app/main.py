"""
Nusa Home API - Main Entry Point
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logging import logger
from pathlib import Path
from app.db.session import init_pool, close_pool, check_database_exists
from app.utils import init_db
from app.services.mqtt_manager import mqtt_manager
from app.services.mqtt_service import run_mqtt_service
from app.services.relay_automation import start_automation_service
import threading
import fcntl

# Import Routers
from app.api.routes.auth import router as auth_router
from app.api.routes.relay import router as relay_router
from app.api.routes.admin import router as admin_router
from app.api.routes.sensors import router as sensors_router
from app.api.routes.settings import router as settings_router
from app.api.routes.profile import router as profile_router
from app.api.routes.history import router as history_router
from app.api.routes.notifications import router as notifications_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events"""
    logger.info("STARTUP | Checking database...")
    if not check_database_exists():
        logger.critical(f"Database '{settings.DB_NAME}' not found.")
        # In production, we might want to exit or let init_db handle it
        # raise RuntimeError("Database not found")
    
    logger.info("STARTUP | Initializing DB Pool...")
    init_pool()
    
    logger.info("STARTUP | Initializing Schema...")
    # Use lock to prevent multiple workers from running migrations concurrently
    schema_lock = open(".schema_init.lock", "w")
    try:
        fcntl.flock(schema_lock, fcntl.LOCK_EX)
        init_db()
    finally:
        fcntl.flock(schema_lock, fcntl.LOCK_UN)
        schema_lock.close()
    
    logger.info("STARTUP | Connecting MQTT Publisher...")
    mqtt_manager.connect()

    logger.info(f"STARTUP | Starting MQTT Listener Service (All-in-One) [PID: {os.getpid()}]...")
    
    # Use a file lock to ensure only one worker runs the MQTT Listener
    lock_file = open(".mqtt_listener.lock", "w")
    try:
        fcntl.lockf(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        app.state.mqtt_lock_file = lock_file
        app.state.mqtt_stop_event = threading.Event()
        app.state.mqtt_thread = threading.Thread(
            target=run_mqtt_service,
            args=(app.state.mqtt_stop_event,),
            daemon=True
        )
        app.state.mqtt_thread.start()
        logger.info(f"STARTUP | MQTT Listener started by worker [PID: {os.getpid()}]")
    except IOError:
        logger.info(f"STARTUP | MQTT Listener already running in another worker (this is PID: {os.getpid()})")
        lock_file.close()
        app.state.mqtt_thread = None
    
    # Start Relay Automation Service
    logger.info(f"STARTUP | Starting Relay Automation Service [PID: {os.getpid()}]...")
    app.state.automation_stop_event = threading.Event()
    app.state.automation_thread = threading.Thread(
        target=start_automation_service,
        args=(app.state.automation_stop_event,),
        daemon=True
    )
    app.state.automation_thread.start()
    logger.info(f"STARTUP | Relay Automation Service started [PID: {os.getpid()}]")

    yield
    
    if hasattr(app.state, 'mqtt_thread') and app.state.mqtt_thread:
        logger.info("SHUTDOWN | Stopping MQTT Listener...")
        app.state.mqtt_stop_event.set()
        app.state.mqtt_thread.join(timeout=2)
        app.state.mqtt_lock_file.close()
        if os.path.exists(".mqtt_listener.lock"):
            try: os.remove(".mqtt_listener.lock")
            except: pass
    
    # Stop automation service
    if hasattr(app.state, 'automation_thread') and app.state.automation_thread:
        logger.info("SHUTDOWN | Stopping Relay Automation Service...")
        app.state.automation_stop_event.set()
        app.state.automation_thread.join(timeout=2)
    
    logger.info("SHUTDOWN | Disconnecting MQTT Publisher...")
    mqtt_manager.disconnect()
    
    logger.info("SHUTDOWN | Closing DB Pool...")
    close_pool()

app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.APP_ENV != "production" else None,
    redoc_url=None
)

# Static Files
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
if STATIC_DIR.exists() and STATIC_DIR.is_dir():
    app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    logger.info(f"Mounted static files from {STATIC_DIR}")
else:
    logger.warning(f"Static directory not found at {STATIC_DIR}")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router, prefix="/api")
app.include_router(relay_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(sensors_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")

@app.get("/")
def root():
    return {
        "status": "ok", 
        "message": f"{settings.API_TITLE} is running",
        "env": settings.APP_ENV
    }
