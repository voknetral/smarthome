"""
Admin Router - User management endpoints (Admin only)
"""
import random
import string
from fastapi import APIRouter, HTTPException, Depends
from app.db.session import get_cursor
from app.models import UserCreateAdmin
from app.utils import hash_password
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users")
def get_all_users(current_admin: dict = Depends(get_current_admin)):
    """List all users (Admin only)"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT id, username, role, created_at, last_active FROM users ORDER BY id ASC")
            users = cur.fetchall()
            return {"users": users}
    except Exception as e:
        raise HTTPException(500, f"Error fetching users: {e}")


@router.post("/users")
def create_user_by_admin(user: UserCreateAdmin, current_admin: dict = Depends(get_current_admin)):
    """Create user/admin manually (Admin only)"""
    try:
        with get_cursor() as cur:
            # Check username
            cur.execute("SELECT id FROM users WHERE username = %s", (user.username,))
            if cur.fetchone():
                raise HTTPException(400, "Username sudah digunakan")
            
            password_hash = hash_password(user.password)
            cur.execute("""
                INSERT INTO users (username, password_hash, role)
                VALUES (%s, %s, %s)
                RETURNING id, username, role, is_active
            """, (user.username, password_hash, user.role))
            
            new_user = cur.fetchone()
            return {"success": True, "user": new_user}
    except HTTPException:
        raise
    except ValueError as e:
        from app.core.logging import logger
        logger.error(f"Error creating user - password processing: {e}")
        raise HTTPException(400, f"Error creating user: {str(e)}")
    except Exception as e:
        from app.core.logging import logger
        logger.error(f"Error creating user: {e}")
        raise HTTPException(500, f"Error creating user: {e}")


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_admin: dict = Depends(get_current_admin)):
    """Delete user (Admin only)"""
    if user_id == 1:
        raise HTTPException(400, "User admin utama tidak dapat dihapus")

    try:
        with get_cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,))
            deleted = cur.fetchone()
            if not deleted:
                raise HTTPException(404, "User tidak ditemukan")
            return {"success": True, "message": "User berhasil dihapus"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error deleting user: {e}")


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, current_admin: dict = Depends(get_current_admin)):
    """Reset user password by Admin (auto-generated)"""
    # Proteksi: User ID 1 tidak boleh di-reset password-nya
    if user_id == 1:
        raise HTTPException(403, "Password Admin Utama (ID 1) tidak dapat di-reset")
    
    try:
        # Generate random 8-char password (within 72 byte limit when encoded)
        chars = string.ascii_letters + string.digits
        temp_password = ''.join(random.choice(chars) for _ in range(8))
        hashed_password = hash_password(temp_password)
        
        with get_cursor() as cur:
            # Check user existence
            cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not cur.fetchone():
                raise HTTPException(404, "User tidak ditemukan")
            
            # Update password and set force flag
            cur.execute("""
                UPDATE users 
                SET password_hash = %s, force_password_change = true 
                WHERE id = %s
            """, (hashed_password, user_id))
            
            return {
                "success": True, 
                "message": "Password berhasil direset",
                "temporary_password": temp_password
            }
    except HTTPException:
        raise
    except ValueError as e:
        from app.core.logging import logger
        logger.error(f"Reset password error - password processing: {e}")
        raise HTTPException(400, f"Reset password error: {str(e)}")
    except Exception as e:
        from app.core.logging import logger
        logger.error(f"Reset password error: {e}")
        raise HTTPException(500, f"Reset password error: {e}")

