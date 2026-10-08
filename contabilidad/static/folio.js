// Antes de generar el PDF de un libro o informe oficial, pregunta el folio inicial.
// Los enlaces con el atributo data-folio abren el diálogo; el PDF se descarga
// con ?folio=N y luego se informa qué folios se usaron.
(function () {
  const dialogo = document.getElementById("dialogo-folio");
  if (!dialogo) return;
  const formulario = dialogo.querySelector("form");
  const campo = formulario.querySelector("input[name=folio]");
  const sugerido = dialogo.querySelector(".folio-sugerido");
  const aviso = dialogo.querySelector(".folio-aviso");
  const botonGenerar = formulario.querySelector("button[type=submit]");
  let proximo = parseInt(dialogo.dataset.proximo, 10) || 1;
  let urlPendiente = null;

  document.addEventListener("click", (evento) => {
    const enlace = evento.target.closest("a[data-folio]");
    if (!enlace) return;
    evento.preventDefault();
    urlPendiente = enlace.href;
    campo.value = proximo;
    sugerido.textContent = proximo;
    aviso.textContent = "";
    dialogo.showModal();
    campo.select();
  });

  dialogo.querySelector("[data-cerrar]").addEventListener("click", () => dialogo.close());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const folio = Number(campo.value);
    if (!Number.isInteger(folio) || folio < 1) {
      aviso.textContent = "Ingresa un número entero mayor o igual a 1.";
      return;
    }
    const url = new URL(urlPendiente);
    url.searchParams.set("folio", folio);
    botonGenerar.disabled = true;
    botonGenerar.textContent = "Generando…";
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) throw new Error(respuesta.statusText);
      const contenido = await respuesta.blob();
      const disposicion = respuesta.headers.get("Content-Disposition") || "";
      const nombre = (disposicion.match(/filename="([^"]+)"/) || [])[1] || "informe.pdf";
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(contenido);
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 30000);

      const usados = (respuesta.headers.get("X-Folios") || "").split("-").map(Number);
      if (usados.length === 2) {
        proximo = Math.max(proximo, usados[1] + 1);
        const texto = usados[0] === usados[1]
          ? `PDF generado con el folio ${usados[0]}.`
          : `PDF generado con los folios ${usados[0]} al ${usados[1]}.`;
        mostrarAviso(`${texto} Próximo folio sugerido: ${proximo}.`);
      }
      dialogo.close();
    } catch (error) {
      aviso.textContent = "No se pudo generar el PDF. Inténtalo de nuevo.";
    } finally {
      botonGenerar.disabled = false;
      botonGenerar.textContent = "Generar PDF";
    }
  });

  function mostrarAviso(texto) {
    const main = document.querySelector("main");
    let caja = document.getElementById("aviso-folio");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "aviso-folio";
      caja.className = "aviso aviso-ok no-imprimir";
      main.prepend(caja);
    }
    caja.textContent = texto;
  }
})();
