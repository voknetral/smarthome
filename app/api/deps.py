from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel

from app.core.config import settings
from app.db.session import get_cursor
from app.utils import logger

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

class TokenData(BaseModel):
    username: Optional[str] = None

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    with get_cursor() as cur:
        cur.execute("SELECT id, username, role FROM users WHERE username = %s", (token_data.username,))
        user = cur.fetchone()
        if user is None:
            raise credentials_exception
        
        # Update last_active timestamp
        cur.execute("UPDATE users SET last_active = NOW() WHERE id = %s", (user['id'],))
        
        return user

def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme_optional)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        
        with get_cursor() as cur:
            cur.execute("SELECT id, username, role FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if user:
                cur.execute("UPDATE users SET last_active = NOW() WHERE id = %s", (user['id'],))
            return user
    except JWTError:
        return None

def get_current_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user
