@echo off
cd /d "%~dp0.."
echo Starting Unit Tagging Tool...
echo Opening http://localhost:8082/tools/unit_tagging.html
start http://localhost:8082/tools/unit_tagging.html
node tools/server_map_editor.js
pause
