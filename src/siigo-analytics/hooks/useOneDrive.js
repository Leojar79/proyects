import { useState, useCallback, useEffect, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { Client } from "@microsoft/microsoft-graph-client";
import { loginRequest, ONEDRIVE_FOLDER, REFRESH_INTERVAL_MS } from "../config/msalConfig";
import { parseExcelBuffer, extractMetrics } from "../utils/excelParser";

function getGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

export function useOneDrive() {
  const { instance, accounts } = useMsal();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const getToken = useCallback(async () => {
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.accessToken;
  }, [instance, accounts]);

  // Carga el Excel más reciente de la carpeta configurada
  const loadLatestFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const client = getGraphClient(token);

      // Lista archivos Excel en la carpeta de empresa
      const endpoint = `/me/drive/root:/${ONEDRIVE_FOLDER}:/children`;
      const response = await client
        .api(endpoint)
        .orderby("lastModifiedDateTime desc")
        .get();

      const excelFiles = response.value.filter((f) =>
        /\.(xlsx|xls|csv)$/i.test(f.name)
      );

      if (!excelFiles.length) {
        setError(`No se encontraron archivos Excel en la carpeta "${ONEDRIVE_FOLDER}".`);
        return;
      }

      // Toma el más reciente
      const latest = excelFiles[0];
      setSelectedFile(`${latest.name} (${new Date(latest.lastModifiedDateTime).toLocaleString()})`);

      const content = await client
        .api(`/me/drive/items/${latest.id}/content`)
        .responseType("arraybuffer")
        .get();

      const rows = parseExcelBuffer(new Uint8Array(content));
      const result = extractMetrics(rows);
      setMetrics(result);
      setLastRefresh(new Date());
    } catch (err) {
      // Carpeta no existe — sugiere crearla
      if (err.statusCode === 404) {
        setError(`La carpeta "${ONEDRIVE_FOLDER}" no existe en OneDrive. Créala y sube un Excel.`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Carga automáticamente al autenticarse y cada REFRESH_INTERVAL_MS
  useEffect(() => {
    if (!accounts.length) return;

    loadLatestFile();

    timerRef.current = setInterval(loadLatestFile, REFRESH_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loading,
    error,
    metrics,
    selectedFile,
    lastRefresh,
    refresh: loadLatestFile,
  };
}
