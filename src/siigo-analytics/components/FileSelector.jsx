import { useState, useRef } from "react";
import { FolderOpen, Upload, RefreshCw, FileSpreadsheet } from "lucide-react";
import { useIsAuthenticated } from "@azure/msal-react";

export default function FileSelector({ files, loading, onListFiles, onAnalyzeFile, onAnalyzeLocal }) {
  const [folder, setFolder] = useState("");
  const fileInputRef = useRef();
  const isAuthenticated = useIsAuthenticated();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Local upload — always visible */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Upload size={16} /> Subir Excel Manualmente
        </h3>
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-lg p-8 cursor-pointer hover:bg-blue-50 transition-colors"
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onAnalyzeLocal(f);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <FileSpreadsheet size={32} className="text-blue-400 mb-2" />
          <span className="text-sm text-gray-500">
            Arrastra un archivo .xlsx/.xls/.csv o{" "}
            <span className="text-blue-600 font-medium">haz click aquí</span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) onAnalyzeLocal(f);
            }}
          />
        </label>
      </div>

      {/* OneDrive section — only if authenticated */}
      {isAuthenticated && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FolderOpen size={16} /> Desde OneDrive
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Carpeta (ej: Siigo/Reportes) — vacío = raíz"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={() => onListFiles(folder || "root")}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Buscar
            </button>
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onAnalyzeFile(f.id, f.name)}
                  className="w-full flex items-center gap-3 p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
                >
                  <FileSpreadsheet size={18} className="text-green-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                    <div className="text-xs text-gray-400">
                      {f.lastModifiedDateTime
                        ? new Date(f.lastModifiedDateTime).toLocaleDateString()
                        : ""}
                      {f.size ? ` · ${(f.size / 1024).toFixed(0)} KB` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
