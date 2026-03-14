"""
Relay Router - Relay control endpoints
"""
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from app.db.session import get_cursor
from app.models import RelayUpdate, RelayRename, RelayModeUpdate, RelayAutomationUpdate
from app.utils import publish_mqtt_relay, publish_mqtt_relay_mode
from app.services.relay_automation import evaluate_and_execute_relay
from app.api.deps import get_current_user, get_current_user_optional
from app.services.mqtt_manager import mqtt_manager
from typing import Optional

router = APIRouter(prefix="/relays", tags=["Relays"])


@router.get("")
def get_relays(current_user: Optional[dict] = Depends(get_current_user_optional)):
    """Get all relays status"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM status_relay ORDER BY id ASC")
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(500, f"Error: {e}")


@router.get("/{relay_id}")
def get_relay_by_id(relay_id: int, current_user: dict = Depends(get_current_user)):
    """Get single relay by ID"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM status_relay WHERE id = %s", (relay_id,))
            result = cur.fetchone()
            if not result:
                raise HTTPException(404, f"Relay dengan ID {relay_id} tidak ditemukan")
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error: {e}")


@router.put("/{relay_id}")
def update_relay_status(relay_id: int, update: RelayUpdate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Update single relay status (on/off)"""
    try:
        # Verify hardware connectivity (MQTT)
        # We no longer raise 503 here because mqtt_manager.publish has a robust
        # persistent connection and background buffering.

        with get_cursor() as cur:
            # Check if relay is in auto mode
            cur.execute("SELECT mode, name FROM status_relay WHERE id = %s", (relay_id,))
            relay = cur.fetchone()
            if not relay:
                raise HTTPException(404, f"Relay dengan ID {relay_id} tidak ditemukan")
            
            if relay['mode'] == 'auto':
                raise HTTPException(400, f"Relay '{relay['name']}' sedang dalam mode otomatis. Nonaktifkan mode auto untuk kontrol manual.")
            
            cur.execute(
                "UPDATE status_relay SET is_active = %s WHERE id = %s RETURNING id, name, gpio, is_active",
                (update.is_active, relay_id)
            )
            result = cur.fetchone()

        # 1. Sync to MQTT in background (Always required for Backend-Driven control)
        background_tasks.add_task(publish_mqtt_relay, result['gpio'], update.is_active)
        
        # 2. Log to history in the background or after MQTT
        with get_cursor() as cur:
            status_text = "ON" if update.is_active else "OFF"
            status_class = "text-green-600" if update.is_active else "text-slate-600"
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"{result['name']} toggled via API", status_text, status_class)
            )
        
        return {"success": True, "relay": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error updating relay: {e}")


@router.patch("/{relay_id}/name")
def rename_relay(relay_id: int, update: RelayRename, current_user: dict = Depends(get_current_user)):
    """Rename relay"""
    try:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE status_relay SET name = %s, description = %s WHERE id = %s RETURNING id, name, description, gpio, is_active",
                (update.name, update.description, relay_id)
            )
            result = cur.fetchone()
            if not result:
                raise HTTPException(404, f"Relay dengan ID {relay_id} tidak ditemukan")
            
            # Log to history
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"Relay renamed to: {update.name}", "Updated", "text-blue-600")
            )
            
            return {"success": True, "relay": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error renaming relay: {e}")


@router.get("/{relay_id}/automation")
def get_relay_automation(relay_id: int, current_user: dict = Depends(get_current_user)):
    """Get automation configuration for a relay"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT mode, auto_config FROM status_relay WHERE id = %s", (relay_id,))
            result = cur.fetchone()
            if not result:
                raise HTTPException(404, f"Relay dengan ID {relay_id} tidak ditemukan")
            
            return {
                "success": True,
                "mode": result['mode'],
                "auto_config": result['auto_config']
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error fetching automation config: {e}")


@router.put("/{relay_id}/automation")
def update_relay_automation(relay_id: int, config: RelayAutomationUpdate, current_user: dict = Depends(get_current_user)):
    """Update automation configuration for a relay"""
    try:
        # Validate mode
        if config.mode not in ['manual', 'auto']:
            raise HTTPException(400, "Mode harus 'manual' atau 'auto'")
        
        # Validate auto_config type
        if config.mode == 'auto' and config.auto_config.type not in ['time', 'sensor', 'combined']:
            raise HTTPException(400, "Auto config type harus 'time', 'sensor', atau 'combined'")
        
        with get_cursor() as cur:
            cur.execute("SELECT name, gpio FROM status_relay WHERE id = %s", (relay_id,))
            relay = cur.fetchone()
            if not relay:
                raise HTTPException(404, f"Relay dengan ID {relay_id} tidak ditemukan")
            
            # Update mode and auto_config
            cur.execute(
                "UPDATE status_relay SET mode = %s, auto_config = %s WHERE id = %s",
                (config.mode, json.dumps(config.auto_config.dict()), relay_id)
            )
            
            # Broadcast mode change via MQTT
            publish_mqtt_relay_mode(relay['gpio'], config.mode)
            
            # Log to history
            mode_label = "Mode Otomatis" if config.mode == 'auto' else "Mode Manual"
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"{relay['name']} diubah ke {mode_label}", "Updated", "text-blue-600")
            )
        
        # 3. Trigger immediate evaluation if mode is auto (OUTSIDE cursor to avoid deadlock)
        if config.mode == 'auto':
            evaluate_and_execute_relay(relay_id, relay['name'], config.auto_config.dict())
        
        return {"success": True, "message": f"Konfigurasi automasi berhasil disimpan"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error updating automation: {e}")


@router.post("/{relay_id}/mode")
def toggle_relay_mode(relay_id: int, mode_update: RelayModeUpdate, current_user: dict = Depends(get_current_user)):
    """Switch between manual and auto mode"""
    try:
        # Validate mode
        if mode_update.mode not in ['manual', 'auto']:
            raise HTTPException(400, "Mode harus 'manual' atau 'auto'")
        
        with get_cursor() as cur:
            cur.execute("SELECT name, gpio FROM status_relay WHERE id = %s", (relay_id,))
            relay = cur.fetchone()
            if not relay:
                raise HTTPException(404, f"Relay dengan ID {relay_id} tidak ditemukan")
            
            # Update mode
            cur.execute("UPDATE status_relay SET mode = %s WHERE id = %s", (mode_update.mode, relay_id))
            
            # Broadcast mode change via MQTT
            publish_mqtt_relay_mode(relay['gpio'], mode_update.mode)
            
            # Log to history
            mode_label = "Mode Otomatis" if mode_update.mode == 'auto' else "Mode Manual"
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"{relay['name']} switched to {mode_label}", mode_label, "text-blue-600")
            )
        
        # 3. Trigger immediate evaluation if mode is auto (OUTSIDE cursor to avoid deadlock)
        if mode_update.mode == 'auto':
            # Fetch full config to evaluate
            with get_cursor() as cur2:
                cur2.execute("SELECT auto_config FROM status_relay WHERE id = %s", (relay_id,))
                config_row = cur2.fetchone()
            
            if config_row and config_row['auto_config']:
                evaluate_and_execute_relay(relay_id, relay['name'], config_row['auto_config'])
        
        return {"success": True, "mode": mode_update.mode}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error toggling mode: {e}")
