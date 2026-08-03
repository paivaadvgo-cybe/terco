@echo off
rem ColorScan Auto — inicia um servidor local e abre o Chrome.
rem A camera exige http://localhost (contexto seguro); abrir o index.html
rem direto (file://) nao funciona.
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale em https://python.org
  echo ^(na instalacao, marque "Add Python to PATH"^)
  pause
  exit /b 1
)

echo Servidor iniciado. Deixe esta janela aberta enquanto usa o app.
echo Abrindo http://localhost:8765 ...
start "" http://localhost:8765
python -m http.server 8765
