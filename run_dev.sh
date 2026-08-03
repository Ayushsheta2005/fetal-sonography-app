#!/bin/bash
echo "Starting Fetal Sonography Reporting Platform..."

# Start Backend
cd /Users/ayushmsheta/.gemini/antigravity/scratch/fetal_sonography_app/backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start Frontend
cd /Users/ayushmsheta/.gemini/antigravity/scratch/fetal_sonography_app/frontend
npm run dev &
FRONTEND_PID=$!

echo "Backend running on http://localhost:8000"
echo "Frontend running on http://localhost:5173"

# Wait for both processes
wait $BACKEND_PID
wait $FRONTEND_PID
