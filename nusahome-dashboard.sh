#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting Smart Home Dashboard (NusaHome)${NC}"

# 1. Navigate to dashboard directory
cd dashboard || { echo "Dashboard directory not found"; exit 1; }

# 2. Start Dashboard
echo -e "${GREEN}Building Dashboard for Production...${NC}"
npm run build

echo -e "${GREEN}Starting Dashboard (Serve) in Production Mode...${NC}"

# Run serve
npx serve -s dist -l 5000

# Note: This runs in foreground. Ctrl+C to stop.
