// Formulario de comprobante: líneas dinámicas, totales y cuadre en vivo.
(function () {
  const cuerpo = document.getElementById("lineas");
  const plantilla = document.getElementById("plantilla-linea");
  const totalDebe = document.getElementById("total-debe");
  const totalHaber = document.getElementById("total-haber");
  const estado = document.getElementById("estado-cuadre");

  const aNumero = (texto) => parseInt((texto || "").replace(/[^\d]/g, ""), 10) || 0;
  const formatear = (n) => n.toLocaleString("es-CL");

  function sumar(nombre) {
    let total = 0;
    cuerpo.querySelectorAll(`input[name="${nombre}"]`).forEach((i) => (total += aNumero(i.value)));
    return total;
  }

  function recalcular() {
    const d = sumar("debe");
    const h = sumar("haber");
    totalDebe.textContent = formatear(d);
    totalHaber.textContent = formatear(h);
    if (d === 0 && h === 0) {
      estado.textContent = "";
      estado.className = "estado-cuadre";
    } else if (d === h) {
      estado.textContent = "✔ El comprobante cuadra";
      estado.className = "estado-cuadre ok";
    } else {
      estado.textContent = `Diferencia: ${formatear(Math.abs(d - h))} (${d > h ? "falta Haber" : "falta Debe"})`;
      estado.className = "estado-cuadre error";
    }
  }

  function agregarLinea() {
    cuerpo.appendChild(plantilla.content.cloneNode(true));
  }

  document.getElementById("agregar").addEventListener("click", () => {
    agregarLinea();
    cuerpo.lastElementChild.querySelector("select").focus();
  });

  cuerpo.addEventListener("click", (e) => {
    if (!e.target.classList.contains("quitar")) return;
    e.target.closest("tr").remove();
    if (cuerpo.children.length < 2) agregarLinea();
    recalcular();
  });

  cuerpo.addEventListener("input", (e) => {
    const campo = e.target;
    if (!campo.classList.contains("monto")) return;
    const fila = campo.closest("tr");
    // "=" completa con la diferencia pendiente
    if (campo.value.trim() === "=") {
      campo.value = "";
      const diferencia = sumar("debe") - sumar("haber");
      const falta = campo.name === "debe" ? -diferencia : diferencia;
      campo.value = falta > 0 ? formatear(falta) : "";
    }
    // Solo Debe o Haber por línea
    if (campo.value.trim() !== "") {
      const otro = fila.querySelector(`input[name="${campo.name === "debe" ? "haber" : "debe"}"]`);
      otro.value = "";
    }
    recalcular();
  });

  cuerpo.addEventListener("focusout", (e) => {
    const campo = e.target;
    if (campo.classList.contains("monto") && campo.value.trim() !== "") {
      const n = aNumero(campo.value);
      campo.value = n ? formatear(n) : "";
      recalcular();
    }
  });

  // Agregar una línea nueva automáticamente al llenar la última
  cuerpo.addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT" && e.target.closest("tr") === cuerpo.lastElementChild && e.target.value) {
      agregarLinea();
    }
  });

  recalcular();
})();
