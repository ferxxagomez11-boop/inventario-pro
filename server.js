const express = require("express");
const crypto = require("crypto");
const conexion = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function limpiarSesionExpirada() {
  const ahora = Date.now();
  for (const [token, data] of sessions.entries()) {
    if (data.expiraEn < ahora) {
      sessions.delete(token);
    }
  }
}

setInterval(limpiarSesionExpirada, 1000 * 60 * 30);

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};

  if (!header) return cookies;

  header.split(";").forEach((parte) => {
    const [clave, ...resto] = parte.trim().split("=");
    cookies[clave] = decodeURIComponent(resto.join("="));
  });

  return cookies;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, savedHash) {
  const [salt, stored] = savedHash.split(":");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(stored, "hex"));
}

function crearSesion(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    user,
    expiraEn: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSesion(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;
  if (!token) return null;

  const data = sessions.get(token);
  if (!data) return null;

  if (data.expiraEn < Date.now()) {
    sessions.delete(token);
    return null;
  }

  data.expiraEn = Date.now() + SESSION_TTL_MS;
  return { token, user: data.user };
}

function requireAuth(req, res, next) {
  const sesion = getSesion(req);
  if (!sesion) {
    return res.redirect("/login?msg=Debes%20iniciar%20sesion");
  }

  req.user = sesion.user;
  req.sessionToken = sesion.token;
  next();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageTemplate(title, content, userName) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="bg-shape bg-shape-1"></div>
  <div class="bg-shape bg-shape-2"></div>

  <header class="topbar">
    <a class="brand" href="/dashboard">Inventario Pro</a>
    <nav>
      ${
        userName
          ? `<span class="user-pill">Hola, ${escapeHtml(userName)}</span>
             <a class="link-btn" href="/dashboard">Panel</a>
             <a class="link-btn danger" href="/logout">Cerrar sesion</a>`
          : `<a class="link-btn" href="/login">Ingresar</a>
             <a class="link-btn" href="/registro">Crear cuenta</a>`
      }
    </nav>
  </header>

  <main class="container">
    ${content}
  </main>
</body>
</html>`;
}

function cardMensaje(tipo, mensaje) {
  if (!mensaje) return "";
  return `<p class="alert ${tipo}">${escapeHtml(mensaje)}</p>`;
}

function toMoney(value) {
  return Number(value).toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

app.get("/", (req, res) => {
  const sesion = getSesion(req);
  if (sesion) return res.redirect("/dashboard");
  return res.redirect("/login");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/registro", (req, res) => {
  const msg = req.query.msg || "";
  const content = `
    <section class="panel auth-panel">
      <h1>Crea tu cuenta</h1>
      <p class="muted">Empieza a gestionar tu inventario con seguridad.</p>
      ${cardMensaje("info", msg)}
      <form action="/registro" method="POST" class="stack-form">
        <label>Nombre completo</label>
        <input type="text" name="nombre" minlength="3" maxlength="100" required>

        <label>Correo electronico</label>
        <input type="email" name="email" maxlength="120" required>

        <label>Contrasena</label>
        <input type="password" name="password" minlength="6" maxlength="80" required>

        <button type="submit">Registrarme</button>
      </form>
      <p class="muted">Ya tienes cuenta? <a href="/login">Inicia sesion</a></p>
    </section>
  `;
  res.send(pageTemplate("Registro", content));
});

app.post("/registro", (req, res) => {
  const nombre = (req.body.nombre || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (nombre.length < 3 || password.length < 6 || !email.includes("@")) {
    return res.redirect("/registro?msg=Revisa%20los%20datos%20ingresados");
  }

  const passwordHash = hashPassword(password);
  const sql = "INSERT INTO usuarios (nombre, email, password_hash) VALUES (?,?,?)";

  conexion.query(sql, [nombre, email, passwordHash], (err, result) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.redirect("/registro?msg=Ese%20correo%20ya%20esta%20registrado");
      }
      console.error("Error al registrar usuario:", err);
      return res.redirect("/registro?msg=No%20se%20pudo%20crear%20la%20cuenta");
    }

    const token = crearSesion({ id: result.insertId, nombre, email });
    res.setHeader("Set-Cookie", `session_token=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax`);
    res.redirect("/dashboard?msg=Cuenta%20creada%20correctamente");
  });
});

app.get("/login", (req, res) => {
  const sesion = getSesion(req);
  if (sesion) return res.redirect("/dashboard");

  const msg = req.query.msg || "";
  const content = `
    <section class="panel auth-panel">
      <h1>Iniciar sesion</h1>
      <p class="muted">Accede a tu panel de inventario.</p>
      ${cardMensaje("info", msg)}
      <form action="/login" method="POST" class="stack-form">
        <label>Correo electronico</label>
        <input type="email" name="email" maxlength="120" required>

        <label>Contrasena</label>
        <input type="password" name="password" minlength="6" maxlength="80" required>

        <button type="submit">Ingresar</button>
      </form>
      <p class="muted">No tienes cuenta? <a href="/registro">Registrate aqui</a></p>
    </section>
  `;

  res.send(pageTemplate("Iniciar sesion", content));
});

app.post("/login", (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.redirect("/login?msg=Completa%20correo%20y%20contrasena");
  }

  conexion.query("SELECT * FROM usuarios WHERE email = ? LIMIT 1", [email], (err, filas) => {
    if (err) {
      console.error("Error en login:", err);
      return res.redirect("/login?msg=Error%20interno%20en%20el%20servidor");
    }

    if (!filas.length || !verifyPassword(password, filas[0].password_hash)) {
      return res.redirect("/login?msg=Credenciales%20invalidas");
    }

    const user = { id: filas[0].id, nombre: filas[0].nombre, email: filas[0].email };
    const token = crearSesion(user);
    res.setHeader("Set-Cookie", `session_token=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax`);
    res.redirect("/dashboard");
  });
});

app.get("/logout", requireAuth, (req, res) => {
  sessions.delete(req.sessionToken);
  res.setHeader("Set-Cookie", "session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.redirect("/login?msg=Sesion%20cerrada%20correctamente");
});

app.get("/dashboard", requireAuth, (req, res) => {
  const msg = req.query.msg || "";
  const sqlResumen = `
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(stock), 0) AS unidades,
      COALESCE(SUM(precio * stock), 0) AS valor,
      SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS agotados
    FROM productos
  `;

  conexion.query(sqlResumen, (err, resumenRows) => {
    if (err) {
      console.error("Error al cargar dashboard:", err);
      return res.status(500).send("Error cargando el panel");
    }

    const resumen = resumenRows[0] || { total: 0, unidades: 0, valor: 0, agotados: 0 };

    const content = `
      <section class="panel">
        <h1>Panel de Inventario</h1>
        <p class="muted">Controla productos, stock y estado del negocio desde un solo lugar.</p>
        ${cardMensaje("success", msg)}
        <div class="stats-grid">
          <article class="stat-card"><h3>Productos</h3><p>${resumen.total}</p></article>
          <article class="stat-card"><h3>Unidades en stock</h3><p>${resumen.unidades}</p></article>
          <article class="stat-card"><h3>Valor estimado</h3><p>$${toMoney(resumen.valor)}</p></article>
          <article class="stat-card"><h3>Agotados</h3><p>${resumen.agotados || 0}</p></article>
        </div>
      </section>

      <section class="panel">
        <h2>Registrar producto</h2>
        <form action="/productos" method="POST" class="form-grid">
          <label>Nombre</label>
          <input type="text" name="nombre" maxlength="120" required>

          <label>Categoria</label>
          <input type="text" name="categoria" maxlength="100" required>

          <label>Precio</label>
          <input type="number" name="precio" step="0.01" min="0" required>

          <label>Stock</label>
          <input type="number" name="stock" min="0" required>

          <button type="submit">Guardar producto</button>
        </form>
      </section>

      <section class="panel">
        <h2>Acciones rapidas</h2>
        <div class="actions-row">
          <a class="link-btn" href="/productos">Ver inventario</a>
          <a class="link-btn" href="/productos?solo=agotados">Ver solo agotados</a>
        </div>
      </section>
    `;

    res.send(pageTemplate("Dashboard", content, req.user.nombre));
  });
});

app.post("/productos", requireAuth, (req, res) => {
  const nombre = (req.body.nombre || "").trim();
  const categoria = (req.body.categoria || "").trim();
  const precio = Number(req.body.precio);
  const stock = Number(req.body.stock);

  if (!nombre || !categoria || Number.isNaN(precio) || Number.isNaN(stock) || precio < 0 || stock < 0) {
    return res.redirect("/dashboard?msg=Datos%20de%20producto%20invalidos");
  }

  const estado = stock > 0 ? "Disponible" : "Agotado";
  const sql = "INSERT INTO productos (nombre, categoria, precio, stock, estado) VALUES (?,?,?,?,?)";

  conexion.query(sql, [nombre, categoria, precio, stock, estado], (err) => {
    if (err) {
      console.error("Error al guardar producto:", err);
      return res.redirect("/dashboard?msg=No%20se%20pudo%20guardar%20el%20producto");
    }

    res.redirect("/productos?msg=Producto%20guardado%20correctamente");
  });
});

app.get("/productos", requireAuth, (req, res) => {
  const msg = req.query.msg || "";
  const solo = req.query.solo || "";
  const where = solo === "agotados" ? " WHERE stock = 0" : "";

  conexion.query(`SELECT * FROM productos${where} ORDER BY id DESC`, (err, filas) => {
    if (err) {
      console.error("Error al listar productos:", err);
      return res.status(500).send("Error al listar productos");
    }

    const rows = filas
      .map((p) => {
        const classRow = p.stock > 0 ? "ok" : "warn";
        return `<tr class="${classRow}">
          <td>${p.id}</td>
          <td>${escapeHtml(p.nombre)}</td>
          <td>${escapeHtml(p.categoria)}</td>
          <td>$${toMoney(p.precio)}</td>
          <td>${p.stock}</td>
          <td>${escapeHtml(p.estado)}</td>
          <td>
            <form action="/productos/${p.id}/stock" method="POST" class="inline-form">
              <input type="number" name="stock" min="0" value="${p.stock}" required>
              <button type="submit">Actualizar</button>
            </form>
            <form action="/productos/${p.id}/eliminar" method="POST" class="inline-form" onsubmit="return confirm('Eliminar producto?')">
              <button type="submit" class="danger-btn">Eliminar</button>
            </form>
          </td>
        </tr>`;
      })
      .join("");

    const content = `
      <section class="panel">
        <h1>Inventario</h1>
        ${cardMensaje("info", msg)}
        <div class="actions-row">
          <a class="link-btn" href="/dashboard">Volver al panel</a>
          <a class="link-btn" href="/productos">Todos</a>
          <a class="link-btn" href="/productos?solo=agotados">Agotados</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Nombre</th><th>Categoria</th><th>Precio</th>
                <th>Stock</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="7">No hay productos registrados</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;

    res.send(pageTemplate("Productos", content, req.user.nombre));
  });
});

app.post("/productos/:id/stock", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const stock = Number(req.body.stock);

  if (Number.isNaN(id) || Number.isNaN(stock) || stock < 0) {
    return res.redirect("/productos?msg=Stock%20invalido");
  }

  const estado = stock > 0 ? "Disponible" : "Agotado";
  conexion.query("UPDATE productos SET stock = ?, estado = ? WHERE id = ?", [stock, estado, id], (err) => {
    if (err) {
      console.error("Error al actualizar stock:", err);
      return res.redirect("/productos?msg=No%20se%20pudo%20actualizar%20el%20stock");
    }
    res.redirect("/productos?msg=Stock%20actualizado");
  });
});

app.post("/productos/:id/eliminar", requireAuth, (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.redirect("/productos?msg=ID%20de%20producto%20invalido");
  }

  conexion.query("DELETE FROM productos WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("Error al eliminar producto:", err);
      return res.redirect("/productos?msg=No%20se%20pudo%20eliminar%20el%20producto");
    }
    res.redirect("/productos?msg=Producto%20eliminado");
  });
});

app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
