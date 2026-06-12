import { MsalProvider, useIsAuthenticated, useMsal } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest, ONEDRIVE_FOLDER } from "./config/msalConfig";
import { useOneDrive } from "./hooks/useOneDrive";
import Dashboard from "./components/Dashboard";
import { LogIn, LogOut, BarChart2, AlertCircle, RefreshCw, FolderOpen } from "lucide-react";

const msalInstance = new PublicClientApplication(msalConfig);

function AppContent() {
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();
  const { loading, error, metrics, selectedFile, lastRefresh, refresh } = useOneDrive();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 size={24} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Siigo Agent Analytics</h1>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <FolderOpen size={12} />
              <span>OneDrive: <span className="font-mono">{ONEDRIVE_FOLDER}</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && lastRefresh && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Actualizado: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          {isAuthenticated && (
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-40"
              title="Recargar ahora"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Recargar</span>
            </button>
          )}
          {isAuthenticated ? (
            <button
              onClick={() => instance.logoutPopup()}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 transition-colors"
            >
              <LogOut size={16} /> Cerrar sesión
            </button>
          ) : (
            <button
              onClick={() => instance.loginPopup(loginRequest)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              <LogIn size={16} /> Iniciar sesión con Microsoft
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Pantalla de login */}
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center py-24 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md w-full shadow-sm">
              <BarChart2 size={48} className="text-blue-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">Bienvenido al Dashboard</h2>
              <p className="text-sm text-gray-500 mb-6">
                Inicia sesión con tu cuenta Microsoft para visualizar los datos del agente Siigo
                desde la carpeta{" "}
                <span className="font-mono font-medium text-gray-700">{ONEDRIVE_FOLDER}</span>.
              </p>
              <button
                onClick={() => instance.loginPopup(loginRequest)}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <LogIn size={16} /> Iniciar sesión con Microsoft 365
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {isAuthenticated && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        {/* Loading inicial */}
        {isAuthenticated && loading && !metrics && (
          <div className="flex flex-col items-center justify-center py-20 text-blue-600 space-y-3">
            <RefreshCw size={32} className="animate-spin" />
            <p className="text-sm">Leyendo datos desde OneDrive...</p>
          </div>
        )}

        {/* Dashboard */}
        {isAuthenticated && metrics && (
          <Dashboard metrics={metrics} fileName={selectedFile} loading={loading} />
        )}
      </main>
    </div>
  );
}

export default function SiigoAnalyticsApp() {
  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}
