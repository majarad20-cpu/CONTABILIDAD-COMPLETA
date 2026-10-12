"""Arma una carpeta portable del programa, lista para copiar a un pendrive.

Uso (desde la carpeta del proyecto):
    .venv\\Scripts\\python.exe crear_portable.py [carpeta_destino]

La carpeta queda así:
    Contabilidad\\
        Abrir Contabilidad.bat   doble clic para usar el programa
        python\\                 Python propio, con Flask, reportlab, openpyxl y Pillow
        programa\\               el código (se reemplaza en cada actualización)
        datos\\                  tus empresas y respaldos (nunca se reemplaza)

Si el destino ya existe, solo se actualizan `python` y `programa`: la carpeta
`datos` del pendrive no se toca. Los datos de este PC se copian únicamente la
primera vez, cuando el destino todavía no tiene datos.
"""
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PYTHON_BASE = Path(sys.base_prefix)
PAQUETES = RAIZ / ".venv" / "Lib" / "site-packages"

# Partes de Python que el programa no usa (ahorran ~100 MB en el pendrive)
OMITIR_PYTHON = {"Doc", "include", "libs", "tcl", "Scripts", "share", "__install__.json"}
OMITIR_LIB = {"site-packages", "test", "idlelib", "tkinter", "turtledemo", "ensurepip", "venv"}
OMITIR_PAQUETES = {"pip", "_distutils_hack"}

LANZADOR = r"""@echo off
rem Abre el programa de contabilidad desde esta carpeta (pendrive o disco), sin instalar nada.
title Contabilidad
cd /d "%~dp0"
set "CONTABILIDAD_DB=%~dp0datos\contabilidad.db"
set "PYTHONDONTWRITEBYTECODE=1"
echo.
echo  Contabilidad se esta abriendo en el navegador...
echo  Para cerrar el programa, cierra ESTA ventana.
echo  No retires el pendrive con el programa abierto.
echo.
"python\python.exe" -E -s "programa\app.py"
if errorlevel 1 pause
"""

LEEME = """CONTABILIDAD PORTABLE
=====================

1. Conecta el pendrive en cualquier PC con Windows 10 u 11 (no necesita Python ni internet).
2. Doble clic en "Abrir Contabilidad.bat". Se abre el navegador con el programa.
3. Para terminar, cierra la ventana negra. Espera unos segundos antes de retirar el pendrive.

Tus datos están en la carpeta "datos" (contabilidad.db y sus respaldos automáticos).
Recomendación: cada cierto tiempo copia la carpeta "datos" a otro lugar como respaldo
(o usa Administración → Respaldos dentro del programa). Si pierdes el pendrive, pierdes los datos.

Abre el programa en un solo PC a la vez.
"""


def ignorar(*nombres):
    nombres = set(nombres)
    return lambda carpeta, contenido: [n for n in contenido if n in nombres or n == "__pycache__"]


def copiar_python(destino):
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    for item in PYTHON_BASE.iterdir():
        if item.name in OMITIR_PYTHON:
            continue
        if item.name == "Lib":
            shutil.copytree(item, destino / "Lib", ignore=ignorar(*OMITIR_LIB))
        elif item.name == "DLLs":
            shutil.copytree(item, destino / "DLLs",
                            ignore=lambda c, n: [x for x in n if x.lower().startswith(("_tkinter", "tcl", "tk"))])
        elif item.is_dir():
            shutil.copytree(item, destino / item.name, ignore=ignorar())
        else:
            shutil.copy2(item, destino / item.name)
    shutil.copytree(PAQUETES, destino / "Lib" / "site-packages", ignore=ignorar(*OMITIR_PAQUETES))


def copiar_programa(destino):
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    shutil.copy2(RAIZ / "app.py", destino / "app.py")
    shutil.copytree(RAIZ / "contabilidad", destino / "contabilidad", ignore=ignorar())


def main():
    destino = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "dist" / "Contabilidad"
    destino = destino.resolve()
    dentro = destino == RAIZ or RAIZ in destino.parents
    if dentro and RAIZ / "dist" not in destino.parents:
        sys.exit("Elige una carpeta de destino fuera del proyecto (o deja el destino por defecto).")
    if not PAQUETES.exists():
        sys.exit("Falta el entorno .venv: abre primero el programa con iniciar.bat.")
    destino.mkdir(parents=True, exist_ok=True)
    print(f"Destino: {destino}")
    print("Copiando Python...")
    copiar_python(destino / "python")
    print("Copiando el programa...")
    copiar_programa(destino / "programa")
    (destino / "Abrir Contabilidad.bat").write_text(LANZADOR.replace("\n", "\r\n"), encoding="ascii")
    (destino / "LEEME.txt").write_text(LEEME.replace("\n", "\r\n"), encoding="utf-8-sig")
    datos = destino / "datos"
    if (datos / "contabilidad.db").exists():
        print("La carpeta datos del destino ya existe: no se modificó.")
    elif (RAIZ / "datos" / "contabilidad.db").exists():
        print("Copiando tus datos (primera vez)...")
        shutil.copytree(RAIZ / "datos", datos, dirs_exist_ok=True,
                        ignore=lambda c, n: [x for x in n if x.endswith((".json", ".csv"))])
    tamano = sum(f.stat().st_size for f in destino.rglob("*") if f.is_file())
    print(f"Listo: {tamano / 1024 / 1024:.0f} MB. Abre «Abrir Contabilidad.bat» para probar.")


if __name__ == "__main__":
    main()
