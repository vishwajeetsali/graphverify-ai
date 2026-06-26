@echo off
title GraphVerify AI Suite Launcher
echo =====================================================================
echo                GRAPHVERIFY AI: ONE-CLICK LAUNCHER
echo =====================================================================
echo.
echo Prerequisites:
echo  1. MongoDB Local Service (mongodb://localhost:27017)
echo  2. Tesseract OCR installed (PATH or C:\Program Files\Tesseract-OCR\)
echo  3. Ollama running with phi3:mini (optional, for LLM explanations)
echo     Run: ollama serve ^& ollama pull phi3:mini
echo.
echo =====================================================================
echo Starting backend and frontend services...
echo.

:: 1. Start Python AI Microservice on Port 8000
echo [1/3] Starting Python FastAPI engine (Port 8000)...
start "GraphVerify — Python AI Engine" cmd /k "cd backend-python && uvicorn main:app --port 8000"

:: 2. Start Node.js Middleware Backend on Port 5000
echo [2/3] Starting Node.js Backend (Port 5000)...
start "GraphVerify — Node Backend" cmd /k "cd backend-node && npm run dev"

:: 3. Start Vite React Frontend on Port 5173
echo [3/3] Starting Vite React Frontend (Port 5173)...
start "GraphVerify — Vite Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo =====================================================================
echo  Services spawned in separate terminal windows!
echo.
echo  Frontend:   http://localhost:5173
echo  Python API: http://localhost:8000     (standalone: http://localhost:8000/)
echo  Node API:   http://localhost:5000/health
echo  Gallery:    http://localhost:8000/gallery
echo =====================================================================
echo.
echo Waiting 8 seconds for services to boot, then running health checks...
timeout /t 8 /nobreak >nul

echo.
echo --- Health Check ---
curl -s http://localhost:8000/health 2>nul && echo  [OK] Python service is alive || echo  [!!] Python service not responding yet
curl -s http://localhost:5000/health 2>nul && echo  [OK] Node service is alive    || echo  [!!] Node service not responding yet
echo.
pause
