@echo off
cd /d "%~dp0.."
echo Starting Reinforcements Editor...
echo Opening http://localhost:8082/tools/reinforcements_editor.html
start http://localhost:8082/tools/reinforcements_editor.html
node tools/server_map_editor.js
pause
