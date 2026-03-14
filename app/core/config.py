import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    # App Info
    API_TITLE: str = "Nusa Home API"
    API_VERSION: str = "1.0.0"
    SECRET_KEY: str = "unsafe-dev-key-12345"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "iotdb"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_POOL_MIN: int = 1
    DB_POOL_MAX: int = 20

    # MQTT
    MQTT_BROKER: str = "192.168.1.26"
    MQTT_PORT: int = 1883
    
    # CORS
    CORS_ORIGINS: List[str] = ["*"] # Default for dev, override in .env for production

    # Deployment
    APP_ENV: str = "development" # change to 'production' in .env

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    @property
    def DB_CONFIG(self) -> dict:
        return {
            "host": self.DB_HOST,
            "port": self.DB_PORT,
            "dbname": self.DB_NAME,
            "user": self.DB_USER,
            "password": self.DB_PASSWORD
        }

settings = Settings()

# Backward Compatibility Export
DB = settings.DB_CONFIG
API_TITLE = settings.API_TITLE
API_VERSION = settings.API_VERSION
CORS_ORIGINS = settings.CORS_ORIGINS
