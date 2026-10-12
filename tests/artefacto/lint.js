/* Análisis estático del script del artefacto: detecta funciones o variables que no existen (error que solo
   aparecería al pulsar el botón correspondiente). Uso: npm run lint */
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const html = fs.readFileSync(path.resolve(__dirname, "../../artefacto/contabilidad.html"), "utf-8");
const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
fs.writeFileSync(path.join(dir, "artefacto.js"), script);
fs.writeFileSync(path.join(dir, "eslint.config.mjs"), `export default [{ files: ["**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: Object.fromEntries(["window","document","localStorage","console","setTimeout","clearTimeout","FileReader","Image","URL","Blob","TextDecoder","Uint8Array","atob","Intl"].map((g) => [g, "readonly"])) }, rules: { "no-undef": "error" } }];`);
const eslint = path.join(__dirname, "node_modules", "eslint", "bin", "eslint.js");
const r = spawnSync(process.execPath, [eslint, "-c", "eslint.config.mjs", "artefacto.js"], { cwd: dir, stdio: "inherit" });
if (r.status === 0) console.log("Sin identificadores indefinidos.");
process.exit(r.status ?? 1);
