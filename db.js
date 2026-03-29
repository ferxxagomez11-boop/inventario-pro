const mysql = require("mysql2");

const conexion = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "inventario_db",
  port: Number(process.env.DB_PORT || 3306),
});

function inicializarBaseDeDatos() {
  const crearUsuarios = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const crearProductos = `
    CREATE TABLE IF NOT EXISTS productos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      categoria VARCHAR(100) NOT NULL,
      precio DECIMAL(10,2) NOT NULL,
      stock INT NOT NULL,
      estado VARCHAR(20) NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  conexion.query(crearUsuarios, (err) => {
    if (err) {
      console.error("Error al crear tabla usuarios:", err.message);
      return;
    }
    console.log("Tabla usuarios lista");
  });

  conexion.query(crearProductos, (err) => {
    if (err) {
      console.error("Error al crear tabla productos:", err.message);
      return;
    }
    console.log("Tabla productos lista");
  });
}

conexion.connect((err) => {
  if (err) throw err;
  console.log("Conectado a MySQL");
  inicializarBaseDeDatos();
});

module.exports = conexion;
