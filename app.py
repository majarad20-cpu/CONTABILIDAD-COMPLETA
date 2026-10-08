"""Punto de entrada: inicia el servidor local y abre el navegador."""
import threading
import webbrowser

from contabilidad import create_app

PUERTO = 5000

app = create_app()

if __name__ == "__main__":
    url = f"http://127.0.0.1:{PUERTO}"
    print(f"Contabilidad en {url}  (Ctrl+C para detener)")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=PUERTO, debug=False)
