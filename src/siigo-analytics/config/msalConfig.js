export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || "YOUR_CLIENT_ID",
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || "YOUR_TENANT_ID"}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["Files.Read", "Files.Read.All", "User.Read"],
};

// Carpeta de OneDrive de la empresa donde se depositan los Excel del agente Siigo.
// Cambia este valor con la ruta real (ej: "Siigo/Reportes/Agente").
export const ONEDRIVE_FOLDER = import.meta.env.VITE_ONEDRIVE_FOLDER || "Siigo/Analytics";

// Intervalo de refresco automático en milisegundos (por defecto 5 minutos).
export const REFRESH_INTERVAL_MS = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 5 * 60 * 1000;
