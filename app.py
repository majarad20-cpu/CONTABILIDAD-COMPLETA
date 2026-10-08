"""Punto de entrada: inicia el servidor local y abre el navegador."""
import os
import threading
import webbrowser

from contabilidad import create_app

PUERTO = 5000

app = create_app()

if __name__ == "__main__":
    url = f"http://127.0.0.1:{PUERTO}"
    if os.environ.get("CODESPACES") == "true":
        # En GitHub Codespaces la pestaña la abre GitHub al reenviar el puerto.
        print(f"Contabilidad iniciada en el puerto {PUERTO}. Si no se abrió sola, ve a la pestaña "
              "«Puertos» y pulsa el ícono del globo en el puerto 5000.  (Ctrl+C para detener)")
    else:
        print(f"Contabilidad en {url}  (Ctrl+C para detener)")
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=PUERTO, debug=False)
