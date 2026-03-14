"""
Auth Router - Authentication endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from app.db.session import get_cursor
from app.models import UserLogin, UserRegister, UserUpdate
from app.utils import hash_password, verify_password, create_access_token, logger
from app.api.deps import get_current_user
import hashlib

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/check-admin")
def check_admin():
    """Check if any admin user exists"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
            result = cur.fetchone()
            return {"hasAdmin": result["count"] > 0}
    except Exception as e:
        # Table might not exist yet
        return {"hasAdmin": False}


@router.post("/register")
def register_user(user: UserRegister):
    """Register new user (Public: First user = Admin, others = User)"""
    try:
        with get_cursor() as cur:
            # Check if any user exists (Bootstrap Admin)
            cur.execute("SELECT COUNT(*) as count FROM users")
            count = cur.fetchone()['count']
            
            determined_role = 'admin' if count == 0 else 'user'
            
            # Check if username exists
            cur.execute("SELECT id FROM users WHERE username = %s", (user.username,))
            if cur.fetchone():
                raise HTTPException(400, "Username sudah digunakan")
            
            # Hash password and insert
            password_hash = hash_password(user.password)
            cur.execute("""
                INSERT INTO users (username, password_hash, role)
                VALUES (%s, %s, %s)
                RETURNING id, username, role
            """, (user.username, password_hash, determined_role))
            
            new_user = cur.fetchone()
            return {
                "success": True,
                "user": {
                    "id": new_user["id"],
                    "username": new_user["username"],
                    "role": new_user["role"],
                    "avatar_url": None
                }
            }
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Registration error - password processing: {e}")
        raise HTTPException(400, f"Registration error: {str(e)}")
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(500, f"Registration error: {e}")


@router.post("/login")
def login_user(user: UserLogin):
    """Login user and return JWT access token"""
    try:
        with get_cursor() as cur:
            cur.execute("""
                SELECT id, username, password_hash, role, force_password_change, avatar_url FROM users 
                WHERE username = %s
            """, (user.username,))
            
            found_user = cur.fetchone()
            if not found_user:
                raise HTTPException(401, "Username atau password salah")
            
            # Password Migration Check (SHA256 -> BCrypt)
            is_valid = False
            rehash_needed = False
            
            # Check if it's a legacy SHA256 hash (64 hex chars)
            if len(found_user["password_hash"]) == 64 and not found_user["password_hash"].startswith("$2"):
                legacy_hash = hashlib.sha256(user.password.encode()).hexdigest()
                if legacy_hash == found_user["password_hash"]:
                    is_valid = True
                    rehash_needed = True
            else:
                # Standard BCrypt check
                is_valid = verify_password(user.password, found_user["password_hash"])
            
            if not is_valid:
                raise HTTPException(401, "Username atau password salah")
            
            if rehash_needed:
                logger.info(f"AUTH | Migrating password for user: {user.username}")
                new_hash = hash_password(user.password)
                cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, found_user["id"]))

            # Create Access Token
            access_token = create_access_token(data={"sub": found_user["username"]})

            # Update last_active
            cur.execute("UPDATE users SET last_active = NOW() WHERE id = %s", (found_user["id"],))

            # Log to history
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"User login: {found_user['username']}", "Success", "text-green-600")
            )

            return {
                "success": True,
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": found_user["id"],
                    "username": found_user["username"],
                    "role": found_user["role"],
                    "avatar_url": found_user["avatar_url"],
                    "isAdmin": found_user["role"] == "admin",
                    "force_password_change": found_user.get("force_password_change", False)
                }
            }
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Login error - password processing: {e}")
        raise HTTPException(400, f"Login error: {str(e)}")
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(500, f"Login error: {e}")


@router.get("/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user"""
    return {
        "success": True,
        "user": current_user
    }


@router.put("/profile")
def update_profile(user: UserUpdate, current_user_token: dict = Depends(get_current_user)):
    """Update user profile (username/password)"""
    try:
        # Security check: User can only update their own profile unless they are admin
        if user.user_id != current_user_token["id"] and current_user_token["role"] != "admin":
            raise HTTPException(403, "Not authorized to update this profile")

        with get_cursor() as cur:
            # 1. Verify current password
            cur.execute("""
                SELECT id, username, password_hash, role FROM users 
                WHERE id = %s
            """, (user.user_id,))
            
            db_user = cur.fetchone()
            if not db_user:
                raise HTTPException(404, "User tidak ditemukan")
            
            if not verify_password(user.current_password, db_user["password_hash"]):
                raise HTTPException(401, "Password saat ini salah")
            
            updates = []
            params = []
            
            # 2. Prepare updates
            if user.username and user.username != db_user["username"]:
                # Check if new username exists
                cur.execute("SELECT id FROM users WHERE username = %s", (user.username,))
                if cur.fetchone():
                    raise HTTPException(400, "Username sudah digunakan")
                updates.append("username = %s")
                params.append(user.username)
            
            if user.new_password:
                new_hash = hash_password(user.new_password)
                updates.append("password_hash = %s")
                params.append(new_hash)
                updates.append("force_password_change = false")
            
            if not updates:
                return {
                    "success": True, 
                    "message": "Tidak ada perubahan",
                    "user": {
                        "id": current_user_token["id"],
                        "username": current_user_token["username"],
                        "role": current_user_token["role"],
                        "isAdmin": current_user_token["role"] == "admin"
                    }
                }
            
            # 3. Execute update
            query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, username, role, avatar_url"
            params.append(user.user_id)
            
            cur.execute(query, tuple(params))
            updated_user = cur.fetchone()
            
            # Log to history
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"Profile updated: {updated_user['username']}", "Updated", "text-blue-600")
            )

            return {
                "success": True,
                "user": {
                    "id": updated_user["id"],
                    "username": updated_user["username"],
                    "role": updated_user["role"],
                    "avatar_url": updated_user["avatar_url"],
                    "isAdmin": updated_user["role"] == "admin"
                }
            }
            
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Update error - password processing: {e}")
        raise HTTPException(400, f"Update error: {str(e)}")
    except Exception as e:
        logger.error(f"Update error: {e}")
        raise HTTPException(500, f"Update error: {e}")
@router.post("/heartbeat")
def user_heartbeat(current_user: dict = Depends(get_current_user)):
    """Refresh user last_active timestamp"""
    try:
        with get_cursor() as cur:
            cur.execute("UPDATE users SET last_active = NOW() WHERE id = %s", (current_user["id"],))
            return {"success": True}
    except Exception as e:
        logger.error(f"Heartbeat error: {e}")
        raise HTTPException(500, "Gagal memperbarui status aktif")


@router.post("/logout")
def logout_user(current_user: dict = Depends(get_current_user)):
    """Mark user as offline by setting last_active to 10 minutes ago"""
    try:
        with get_cursor() as cur:
            # Set last_active to 10 minutes ago so they appear offline immediately
            # (Front-end considers > 5 min as offline)
            cur.execute("UPDATE users SET last_active = NOW() - INTERVAL '10 minutes' WHERE id = %s", (current_user["id"],))
            
            # Log logout to history
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"User logout: {current_user['username']}", "Offline", "text-slate-600")
            )
            return {"success": True}
    except Exception as e:
        logger.error(f"Logout status error: {e}")
        raise HTTPException(500, "Gagal memperbarui status logout")
