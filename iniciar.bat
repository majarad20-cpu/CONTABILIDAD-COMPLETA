@echo off
rem Inicia el programa de contabilidad. Instala o actualiza lo necesario.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Preparando el entorno por primera vez...
    python -m venv .venv || goto error
)
".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements.txt || goto error
".venv\Scripts\python.exe" app.py
goto fin
:error
echo.
echo No se pudo preparar el entorno. Verifica que Python este instalado.
pause
:fin
