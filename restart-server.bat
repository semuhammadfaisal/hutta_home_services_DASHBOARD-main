@echo off
echo Killing any process on port 10000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :10000 ^| findstr LISTENING') do (
    echo Killing PID %%a
    taskkill /F /PID %%a 2>nul
)

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Starting server...
cd backend
node server.js
