import { useState, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { Client } from "@microsoft/microsoft-graph-client";
import { loginRequest } from "../config/msalConfig";
import { parseExcelBuffer, extractMetrics } from "../utils/excelParser";

function getGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

export function useOneDrive() {
  const { instance, accounts } = useMsal();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const getToken = useCallback(async () => {
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.accessToken;
  }, [instance, accounts]);

  const listExcelFiles = useCallback(async (folderPath = "root") => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const client = getGraphClient(token);

      const endpoint =
        folderPath === "root"
          ? "/me/drive/root/children"
          : `/me/drive/root:/${folderPath}:/children`;

      const response = await client.api(endpoint).get();
      const excelFiles = response.value.filter((f) =>
        /\.(xlsx|xls|csv)$/i.test(f.name)
      );
      setFiles(excelFiles);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const analyzeFile = useCallback(async (fileId, fileName) => {
    setLoading(true);
    setError(null);
    setSelectedFile(fileName);
    try {
      const token = await getToken();
      const client = getGraphClient(token);

      const response = await client
        .api(`/me/drive/items/${fileId}/content`)
        .responseType("arraybuffer")
        .get();

      const rows = parseExcelBuffer(new Uint8Array(response));
      const result = extractMetrics(rows);
      setMetrics(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const analyzeLocalFile = useCallback((file) => {
    setLoading(true);
    setError(null);
    setSelectedFile(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseExcelBuffer(new Uint8Array(e.target.result));
        const result = extractMetrics(rows);
        setMetrics(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return {
    files,
    loading,
    error,
    metrics,
    selectedFile,
    listExcelFiles,
    analyzeFile,
    analyzeLocalFile,
  };
}
