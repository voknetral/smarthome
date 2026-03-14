from pydantic import BaseModel
from typing import Optional


class RelayUpdate(BaseModel):
    is_active: bool


class RelayRename(BaseModel):
    name: str
    description: str | None = None


class RelayModeUpdate(BaseModel):
    mode: str  # 'manual' or 'auto'


class TimeRule(BaseModel):
    id: str
    days: list[str]  # ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    start_time: str  # "18:00"
    end_time: str    # "06:00"
    action: str      # 'on' or 'off'


class SensorRule(BaseModel):
    id: str
    sensor: str      # 'dht22', 'mq2', 'pzem004t', 'bh1750'
    metric: str      # 'temperature', 'humidity', 'lux', etc
    operator: str    # '<', '>', '<=', '>=', '=='
    value: float
    action: str      # 'on' or 'off'


class AutoConfig(BaseModel):
    type: str  # 'time', 'sensor', 'combined'
    time_rules: list[TimeRule] = []
    sensor_rules: list[SensorRule] = []


class RelayAutomationUpdate(BaseModel):
    mode: str
    auto_config: AutoConfig
