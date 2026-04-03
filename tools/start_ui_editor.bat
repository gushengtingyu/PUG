@echo off
cd /d "%~dp0.."
echo Starting UI Editor...
echo Opening http://localhost:8082/tools/ui_editor.html
start http://localhost:8082/tools/ui_editor.html
node tools/server_map_editor.js
pause
