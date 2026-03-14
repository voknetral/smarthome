from pydantic import BaseModel, field_validator
from typing import Optional


def _truncate_password_safe(password: str, max_bytes: int = 72) -> str:
    """Safely truncate password to max_bytes at UTF-8 byte level."""
    if not isinstance(password, str):
        return password
    
    # Encode to UTF-8 and truncate to max_bytes
    encoded = password.encode('utf-8')
    if len(encoded) <= max_bytes:
        return password
    
    # Truncate and decode, handling incomplete multi-byte characters
    truncated = encoded[:max_bytes]
    # Try to decode, removing incomplete characters from the end
    while truncated:
        try:
            return truncated.decode('utf-8')
        except UnicodeDecodeError:
            truncated = truncated[:-1]
    
    return ""


class UserLogin(BaseModel):
    username: str
    password: str
    
    @field_validator('password', mode='before')
    @classmethod
    def truncate_password(cls, v):
        """Truncate password to 72 bytes (BCrypt limit)"""
        return _truncate_password_safe(v)


class UserRegister(BaseModel):
    username: str
    password: str
    role: str = "admin"
    
    @field_validator('password', mode='before')
    @classmethod
    def truncate_password(cls, v):
        """Truncate password to 72 bytes (BCrypt limit)"""
        return _truncate_password_safe(v)


class UserUpdate(BaseModel):
    user_id: int
    current_password: str
    username: Optional[str] = None
    new_password: Optional[str] = None
    
    @field_validator('current_password', 'new_password', mode='before')
    @classmethod
    def truncate_password(cls, v):
        """Truncate password to 72 bytes (BCrypt limit)"""
        return _truncate_password_safe(v)


class UserCreateAdmin(BaseModel):
    username: str
    password: str
    role: str = "user"
    
    @field_validator('password', mode='before')
    @classmethod
    def truncate_password(cls, v):
        """Truncate password to 72 bytes (BCrypt limit)"""
        return _truncate_password_safe(v)
