#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting Smart Home IoT System (Production Mode)${NC}"

# 1. Activate Venv
source venv/bin/activate

# 2. Start API using Gunicorn
# MQTT client is now managed by FastAPI Lifespan (app/main.py), so we don't need a separate process.
echo -e "${GREEN}Starting API (Gunicorn) in Foreground...${NC}"

# Note: Pydantic Settings will automatically load .env; no need to source it here.

# Run Gunicorn
gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    --workers 3 \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - 

# Note: This runs in foreground now for better debugging. Ctrl+C to stop.
