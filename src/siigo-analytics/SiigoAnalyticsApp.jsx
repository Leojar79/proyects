import { useState } from "react";
import { MsalProvider, useIsAuthenticated, useMsal } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "./config/msalConfig";
import { useOneDrive } from "./hooks/useOneDrive";
import FileSelector from "./components/FileSelector";
import Dashboard from "./components/Dashboard";
import { LogIn, LogOut, BarChart2, AlertCircle } from "lucide-react";

const msalInstance = new PublicClientApplication(msalConfig);

function AppContent() {
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();
  const {
    files, loading, error, metrics, selectedFile,
    listExcelFiles, analyzeFile, analyzeLocalFile,
  } = useOneDrive();
  const [tab, setTab] = useState("upload");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 size={24} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Siigo Agent Analytics</h1>
            <p className="text-xs text-gray-400">Dashboard de Usabilidad del Agente</p>
          </div>
        </div>
        <div>
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
              <LogIn size={16} /> Conectar OneDrive
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Banner OneDrive */}
        {!isAuthenticated && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-700">
              <strong>Sin OneDrive:</strong> Puedes subir el Excel manualmente debajo. Para leer
              archivos automáticamente desde OneDrive, conecta tu cuenta Microsoft arriba.
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="text-center py-4 text-blue-600 text-sm animate-pulse">
            Procesando archivo...
          </div>
        )}

        {/* File selector */}
        <FileSelector
          files={files}
          loading={loading}
          onListFiles={listExcelFiles}
          onAnalyzeFile={analyzeFile}
          onAnalyzeLocal={analyzeLocalFile}
        />

        {/* Dashboard */}
        {metrics && !loading && (
          <Dashboard metrics={metrics} fileName={selectedFile} />
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
