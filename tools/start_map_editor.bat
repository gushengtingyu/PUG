@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Starting Map Editor Server...
echo Loading spaces.csv with tribal_activity_grid and jihad_city...
echo Opening http://localhost:8082/tools/map_editor.html
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8082/tools/map_editor.html"
node tools/server_map_editor.js
pause
