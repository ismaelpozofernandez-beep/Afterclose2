# Deploy AfterClose

## Backend en Render

1. Sube este proyecto a GitHub sin el archivo `.env`.
2. En Render crea un nuevo Web Service desde el repositorio.
3. Usa estos comandos si Render no detecta el `render.yaml`:
   - Build Command: `npm install`
   - Start Command: `npm run server`
4. Añade estas variables de entorno en Render:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
5. Cuando Render termine, abre la URL publica del backend. Debe responder con JSON de AfterClose API.

## APK apuntando al backend publico

Antes de crear la build Android, configura la URL publica del backend para Expo/EAS:

```powershell
$env:EXPO_PUBLIC_API_HOST="https://TU-BACKEND.onrender.com"
$env:EAS_NO_VCS=1
eas build --platform android --profile preview
```

Tambien puedes crear la variable `EXPO_PUBLIC_API_HOST` en el dashboard de EAS para el environment `preview`.