# Despliegue en Render

Este proyecto ya esta preparado para subirse a Render porque:

- Usa `process.env.PORT` en el servidor.
- Usa variables de entorno para MySQL en `db.js`.
- Incluye `render.yaml`.
- Tiene endpoint de salud en `/health`.

## Variables de entorno necesarias

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

## Pasos recomendados

1. Sube el proyecto a un repositorio de GitHub.
2. Entra a Render y crea un nuevo `Web Service`.
3. Conecta el repositorio.
4. Render detectara Node.js.
5. Usa:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Agrega las variables de entorno de la base de datos.
7. Despliega el servicio.
8. Al terminar, Render te dara un link publico.

## Importante

- Tu base de datos MySQL debe ser accesible desde internet o desde Render.
- Si tu MySQL esta solo en `localhost`, Render no podra conectarse.
- Lo ideal es usar un MySQL externo o un servicio administrado.
