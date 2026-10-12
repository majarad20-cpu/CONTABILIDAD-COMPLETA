// Ventana para agregar, editar o eliminar documentos del Registro de Compras y Ventas.
(function () {
  const dialogo = document.getElementById("dialogo-documento");
  if (!dialogo) return;
  const formulario = document.getElementById("form-documento");
  const titulo = document.getElementById("titulo-documento");
  const error = dialogo.querySelector(".error-documento");
  const avisoCentralizado = dialogo.querySelector(".aviso-centralizado");
  const enlaceComprobante = dialogo.querySelector(".enlace-comprobante");
  const botonGuardar = dialogo.querySelector(".guardar-documento");
  const botonEliminar = dialogo.querySelector(".eliminar-documento");
  const totalSalida = formulario.elements.total;
  const montos = ["exento", "neto", "iva", "iva_no_recuperable", "otros_impuestos"];
  const TIPOS_RESUMEN = [35, 38, 39, 41, 48];
  const NOTAS_CREDITO = [60, 61, 112];

  const aNumero = (texto) => parseInt(String(texto || "").replace(/[^\d]/g, ""), 10) || 0;
  const formatear = (n) => (n ? n.toLocaleString("es-CL") : "");
  const campo = (nombre) => formulario.elements[nombre];

  function recalcular() {
    const registro = campo("registro").value;
    const total = montos
      .filter((m) => registro === "COMPRA" || m !== "iva_no_recuperable")
      .reduce((suma, m) => suma + aNumero(campo(m).value), 0);
    totalSalida.textContent = total.toLocaleString("es-CL");
    const tipo = Number(campo("tipo_doc").value);
    dialogo.querySelector(".campo-cantidad").hidden = !TIPOS_RESUMEN.includes(tipo);
    titulo.dataset.nc = NOTAS_CREDITO.includes(tipo) ? "1" : "";
  }

  function abrir(doc, registro) {
    formulario.reset();
    error.textContent = "";
    const editable = !doc || !doc.asiento_id;
    campo("id").value = doc ? doc.id : "";
    campo("registro").value = doc ? doc.registro : registro;
    const esCompra = campo("registro").value === "COMPRA";
    titulo.textContent = doc
      ? `${editable ? "Editar" : "Ver"} ${esCompra ? "compra" : "venta"}`
      : `Agregar ${esCompra ? "compra" : "venta"}`;
    dialogo.querySelectorAll(".solo-compra").forEach((e) => (e.hidden = !esCompra));
    if (doc) {
      campo("tipo_doc").value = doc.tipo_doc;
      campo("folio").value = doc.folio;
      campo("fecha").value = doc.fecha;
      campo("rut").value = doc.rut;
      campo("razon_social").value = doc.razon_social;
      campo("cantidad").value = doc.cantidad;
      montos.forEach((m) => (campo(m).value = formatear(doc[m])));
      campo("activo_fijo").checked = !!doc.activo_fijo;
      campo("cuenta_id").value = doc.cuenta_id || "";
    } else {
      campo("tipo_doc").value = "33";
      campo("fecha").value = (document.querySelector("input[name=periodo][type=month]") || {}).value
        ? `${document.querySelector("input[name=periodo][type=month]").value}-01` : "";
    }
    // Los documentos centralizados solo se pueden ver
    Array.from(formulario.elements).forEach((e) => {
      if (e.type !== "hidden" && !e.hasAttribute("data-cerrar")) e.disabled = !editable;
    });
    avisoCentralizado.hidden = editable;
    if (!editable) {
      enlaceComprobante.textContent = doc.comprobante;
      enlaceComprobante.href = `/asientos/${doc.asiento_id}`;
    }
    botonGuardar.hidden = !editable;
    botonEliminar.hidden = !editable || !doc;
    recalcular();
    dialogo.showModal();
    if (editable) campo(doc ? "folio" : "tipo_doc").focus();
  }

  document.addEventListener("click", (evento) => {
    const editar = evento.target.closest(".editar-doc");
    if (editar) return abrir(JSON.parse(editar.dataset.doc));
    const nuevo = evento.target.closest("[data-nuevo]");
    if (nuevo) abrir(null, nuevo.dataset.nuevo);
  });
  // Doble clic en una fila también la abre
  document.querySelectorAll(".tabla-rcv tbody tr").forEach((fila) => {
    fila.addEventListener("dblclick", (evento) => {
      if (evento.target.closest("select, input, a")) return;
      const boton = fila.querySelector(".editar-doc");
      if (boton) abrir(JSON.parse(boton.dataset.doc));
    });
  });

  dialogo.querySelector("[data-cerrar]").addEventListener("click", () => dialogo.close());
  formulario.addEventListener("input", recalcular);
  formulario.addEventListener("focusout", (evento) => {
    if (evento.target.classList.contains("monto-doc") && evento.target.value.trim()) {
      evento.target.value = formatear(aNumero(evento.target.value));
    }
  });

  async function enviar(url, datos) {
    error.textContent = "";
    try {
      const respuesta = await fetch(url, { method: "POST", body: datos });
      const resultado = await respuesta.json();
      if (!resultado.ok) {
        error.textContent = resultado.error || "No se pudo guardar.";
        return;
      }
      location.reload();
    } catch (e) {
      error.textContent = "No se pudo conectar con el programa. Inténtalo de nuevo.";
    }
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    enviar("/rcv/documento", new FormData(formulario));
  });

  botonEliminar.addEventListener("click", () => {
    const id = campo("id").value;
    if (id && confirm(`¿Eliminar el documento folio ${campo("folio").value}?`)) {
      enviar(`/rcv/documento/${id}/eliminar`, new FormData());
    }
  });
})();
