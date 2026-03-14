# Models package
from .user import UserLogin, UserRegister, UserUpdate, UserCreateAdmin
from .relay import RelayUpdate, RelayRename, RelayModeUpdate, RelayAutomationUpdate, TimeRule, SensorRule, AutoConfig
from .settings import SettingsUpdate, TelegramTest
from .history import HistoryCreate, HistoryEntry

__all__ = [
    "UserLogin",
    "UserRegister", 
    "UserUpdate",
    "UserCreateAdmin",
    "RelayUpdate",
    "RelayRename",
    "RelayModeUpdate",
    "RelayAutomationUpdate",
    "TimeRule",
    "SensorRule",
    "AutoConfig",
    "SettingsUpdate",
    "TelegramTest",
    "HistoryCreate",
    "HistoryEntry",
]
