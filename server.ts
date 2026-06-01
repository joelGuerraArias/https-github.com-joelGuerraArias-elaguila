import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import {
  getEmailContent,
  extractUrls,
  scrapeNewsUrl,
  analyzeAlertWithGemini,
  syncAlertToSheet,
  decodeBase64Url,
  ai
} from "./server/utils.js";
import { Alert, SyncLog } from "./src/types.js";

const activeFilename = typeof import.meta !== "undefined" && import.meta.url
  ? fileURLToPath(import.meta.url)
  : (typeof __filename !== "undefined" ? __filename : "");

const activeDirname = activeFilename
  ? path.dirname(activeFilename)
  : (typeof __dirname !== "undefined" ? __dirname : "");

function extractSpreadsheetId(val: string): string {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed.includes("/spreadsheets/d/")) {
    const parts = trimmed.split("/spreadsheets/d/");
    if (parts[1]) {
      return parts[1].split("/")[0].split("?")[0].split("#")[0];
    }
  } else if (trimmed.includes("/spreadsheets/u/")) {
    const parts = trimmed.split("/spreadsheets/u/");
    if (parts[1]) {
      const subParts = parts[1].split("/d/");
      if (subParts[1]) {
        return subParts[1].split("/")[0].split("?")[0].split("#")[0];
      }
    }
  }
  return trimmed;
}

async function resolveGoogleToken(clientToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (refreshToken && clientId && clientSecret) {
    try {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.access_token) {
          console.log("[OAUTH RESOLVER] Token de Google renovado con éxito usando GOOGLE_REFRESH_TOKEN.");
          return data.access_token;
        }
      } else {
        const errorText = await refreshRes.text();
        console.error("[OAUTH RESOLVER] Fallo al renovar el token con GOOGLE_REFRESH_TOKEN:", errorText);
      }
    } catch (e: any) {
      console.error("[OAUTH RESOLVER] Error de red al solicitar renovación a Google:", e.message || e);
    }
  }
  return clientToken;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON request body parser
  app.use(express.json({ limit: "15mb" }));

  // Dynamic status store in-memory for live operations tracking
  let systemLogs: SyncLog[] = [
    {
      timestamp: new Date().toISOString(),
      type: "info",
      message: "Procesador de Alertas INTRANT iniciado y listo."
    }
  ];

  // API Check status
  app.get("/api/health", (req, res) => {
    const bypassConfigured = !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      bypassConfigured
    });
  });

  // Retrieve temporary memory logs
  app.get("/api/logs", (req, res) => {
    res.json({ logs: systemLogs });
  });

  // Clean memory logs
  app.post("/api/logs/clear", (req, res) => {
    systemLogs = [
      {
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Logs del sistema limpiados."
      }
    ];
    res.json({ success: true, logs: systemLogs });
  });

  // Verify Google Sheet ID connection & fetch existing headers
  app.post("/api/sheet-info", async (req, res) => {
    let { accessToken, spreadsheetId, sheetName } = req.body;
    const bypassConfigured = !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    const activeToken = accessToken || "bypass";
    if (activeToken === "bypass" && !bypassConfigured) {
      return res.status(400).json({ error: "Faltan credenciales o ID del Sheet. Debe iniciar sesión con Google para continuar." });
    }
    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({ error: "Faltan ID del Sheet o el nombre de la pestaña." });
    }

    try {
      spreadsheetId = extractSpreadsheetId(spreadsheetId);
      const resolvedToken = await resolveGoogleToken(activeToken);
      const encodedSheet = encodeURIComponent(sheetName);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheet}!A1:Z1`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${resolvedToken}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let displayError = `Error al conectar con Google Sheets: ${errorText}`;
        if (response.status === 403 || errorText.includes("insufficient")) {
          displayError = "⚠️ Permisión Insuficiente (Google Sheets): El token de Google no tiene permisos para leer o escribir en Google Sheets ('https://www.googleapis.com/auth/spreadsheets'). Si estás usando Bypass de fondo, asegúrate de que tu GOOGLE_REFRESH_TOKEN fue generado incluyendo ese scope en el GCP Console o OAuth Playground. Si iniciaste sesión manualmente, asegúrate de marcar la casilla de permiso correspondiente en el Consent Screen.";
        }
        return res.status(response.status).json({
          error: displayError
        });
      }

      const data = await response.json();
      const headers = data.values && data.values.length > 0 ? data.values[0] : [];
      return res.json({ success: true, headers });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Error desconocido del servidor." });
    }
  });

  // Get all sheet tabs of a spreadsheet
  app.post("/api/list-sheets", async (req, res) => {
    let { accessToken, spreadsheetId } = req.body;
    const bypassConfigured = !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    const activeToken = accessToken || "bypass";
    if (activeToken === "bypass" && !bypassConfigured) {
      return res.status(400).json({ error: "Faltan credenciales de acceso a Google. Debe iniciar sesión con Google para continuar." });
    }
    if (!spreadsheetId || !spreadsheetId.toString().trim()) {
      return res.status(400).json({ error: "Falta el ID del Google Sheet." });
    }

    try {
      spreadsheetId = extractSpreadsheetId(spreadsheetId);
      const resolvedToken = await resolveGoogleToken(activeToken);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${resolvedToken}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let displayError = `Error al obtener pestañas de la hoja: ${errorText}`;
        if (response.status === 403 || errorText.includes("insufficient")) {
          displayError = "⚠️ Permisión Insuficiente (Google Sheets): Tu token de Google no tiene permisos para leer la información de Google Sheets ('https://www.googleapis.com/auth/spreadsheets'). Genera tu GOOGLE_REFRESH_TOKEN incluyendo el scope de Sheets o asegúrate de marcar la casilla de permiso en la pantalla de consentimiento al iniciar sesión.";
        }
        return res.status(response.status).json({
          error: displayError
        });
      }

      const data = await response.json();
      const sheetsList = data.sheets || [];
      const sheetNames = sheetsList.map((s: any) => s.properties?.title).filter(Boolean);
      return res.json({ success: true, sheets: sheetNames });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Error desconocido al listar las pestañas." });
    }
  });

  // Fetch news list from Spreadsheet with specific row indexing
  app.post("/api/get-sheet-news", async (req, res) => {
    let { accessToken, spreadsheetId, sheetName } = req.body;
    const bypassConfigured = !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    const activeToken = accessToken || "bypass";
    if (activeToken === "bypass" && !bypassConfigured) {
      return res.status(400).json({ error: "Faltan credenciales de acceso a Google. Debe iniciar sesión con Google para continuar." });
    }
    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({ error: "Falta el ID del Sheet o el nombre de la pestaña." });
    }

    try {
      spreadsheetId = extractSpreadsheetId(spreadsheetId);
      const resolvedToken = await resolveGoogleToken(activeToken);
      const encodedSheet = encodeURIComponent(sheetName);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheet}!A:Z`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${resolvedToken}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let displayError = `Error al leer las filas del Google Sheet: ${errorText}`;
        if (response.status === 403 || errorText.includes("insufficient")) {
          displayError = "⚠️ Permisión Insuficiente (Google Sheets): Tu token de Google no tiene permisos para leer los datos del Google Sheet ('https://www.googleapis.com/auth/spreadsheets'). Genera tu GOOGLE_REFRESH_TOKEN incluyendo el scope de Sheets o asegúrate de marcar la casilla de permiso en la pantalla de consentimiento al iniciar sesión.";
        }
        return res.status(response.status).json({
          error: displayError
        });
      }

      const data = await response.json();
      const rows = data.values || [];
      if (rows.length === 0) {
        return res.json({ success: true, news: [] });
      }      const headers = rows[0] || [];
      
      let dateIdx = headers.findIndex((h: string) => h && h.toLowerCase().includes("fecha"));
      if (dateIdx === -1) dateIdx = 0;

      let subjectIdx = headers.findIndex((h: string) => h && (h.toLowerCase().includes("asunto") || h.toLowerCase().includes("título") || h.toLowerCase().includes("titulo") || h.toLowerCase().includes("subject") || h.toLowerCase().includes("tema") || h.toLowerCase().includes("noticia")));
      if (subjectIdx === -1) subjectIdx = 1;

      let senderIdx = headers.findIndex((h: string) => h && (h.toLowerCase().includes("remitente") || h.toLowerCase().includes("de:") || h.toLowerCase().includes("sender") || h.toLowerCase().includes("origen")));
      if (senderIdx === -1) senderIdx = 2;

      let contentIdx = headers.findIndex((h: string) => h && (h.toLowerCase().includes("contenido") || h.toLowerCase().includes("descripción") || h.toLowerCase().includes("descripcion") || h.toLowerCase().includes("cuerpo") || h.toLowerCase().includes("summary") || h.toLowerCase().includes("resumen")));
      if (contentIdx === -1) contentIdx = 3;

      let urlIdx = headers.findIndex((h: string) => h && (h.toLowerCase().includes("enlace") || h.toLowerCase().includes("url") || h.toLowerCase().includes("link") || h.toLowerCase().includes("noticia")));
      if (urlIdx === -1) urlIdx = 4;

      let notesIdx = headers.findIndex((h: string) => h && (h.toLowerCase().includes("datos") || h.toLowerCase().includes("hechos") || h.toLowerCase().includes("fact") || h.toLowerCase().includes("extra") || h.toLowerCase().includes("detalles")));
      if (notesIdx === -1) notesIdx = 5;

      const newsList = rows.slice(1).map((row: any[], i: number) => {
        const sheetRowNumber = i + 2; 
        
        // Skip empty or blank rows
        if (!row || row.every(val => !val || val.toString().trim() === "")) {
          return null;
        }

        const date = row[dateIdx] ? row[dateIdx].toString().trim() : "";
        const subject = row[subjectIdx] ? row[subjectIdx].toString().trim() : "";
        const sender = row[senderIdx] ? row[senderIdx].toString().trim() : "";
        const content = row[contentIdx] ? row[contentIdx].toString().trim() : "";
        const newsUrl = row[urlIdx] ? row[urlIdx].toString().trim() : "";
        const otherData = row[notesIdx] ? row[notesIdx].toString().trim() : "";

        // Intelligently fallback for subject/title to avoid displaying "Sin Asunto" inside the app
        let finalSubject = subject;
        if (!finalSubject) {
          if (content) {
            finalSubject = content.length > 70 ? content.substring(0, 67) + "..." : content;
          } else if (newsUrl) {
            finalSubject = `Noticia Enlace: ${newsUrl.substring(0, 45)}...`;
          } else {
            finalSubject = `Fila ${sheetRowNumber} (Sin Título)`;
          }
        }

        return {
          rowNumber: sheetRowNumber,
          date,
          subject: finalSubject,
          sender,
          content,
          newsUrl,
          otherData
        };
      }).filter(Boolean);

      // Show latest items custom sorted or filtered
      return res.json({ success: true, news: newsList });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Error desconocido al obtener noticias de la hoja." });
    }
  });

  // Chatbot Assistant using Gemini API (server-side ONLY)
  app.post("/api/chat", async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Faltan o están mal formateados los mensajes." });
    }

    try {
      // Map message structure user/assistant to user/model roles
      const contents = messages.map((msg: any) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.text }]
      }));

      const chatResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction: `Eres "El Águila Digital", el chatbot / asistente virtual oficial e inteligente del sistema "EL ÁGUILA" para el procesamiento de alertas de prensa de INTRANT y Milton Morrison.
Tu tarea es ayudar a los usuarios del sistema. Puedes dar explicaciones detalladas y prácticas de cómo activar la vigilancia, cómo conectar su cuenta de Google, obtener su Token Manual utilizando Google OAuth Playground, copiar o pegar el ID del Google Sheet, y las implicaciones del filtro exclusivo del "Día de Hoy".
Habla con el tono característico de un "Analista del Águila": audaz, observador, culto, formal y al mismo tiempo muy atento y cordial.
Evita respuestas excesivamente largas, pero asegúrate de sugerir acciones claras para mejorar la vigilancia del sistema. Respond en español.`,
        }
      });

      return res.json({ success: true, text: chatResponse.text });
    } catch (err: any) {
      console.error("Error en endpoint /api/chat:", err);
      return res.status(500).json({ error: err.message || "Error al procesar consulta." });
    }
  });

  // Main sync engine route
  app.post("/api/sync", async (req, res) => {
    const {
      accessToken,
      spreadsheetId: rawSpreadsheetId,
      sheetName,
      searchQuery = 'INTRANT OR Morrison OR "Milton Morrison" OR "Celso Marranzini"',
      onlyToday = true,
      currentLocalDate
    } = req.body;

    const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
    const bypassConfigured = !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    const activeToken = accessToken || "bypass";
    const hasAccessToken = !!accessToken && accessToken !== "bypass";

    if (!hasAccessToken && !bypassConfigured) {
      return res.status(400).json({
        error: "Parámetros incompletos. Se necesita iniciar sesión con Google para obtener un token de acceso activo."
      });
    }

    if (!spreadsheetId || !sheetName || !currentLocalDate) {
      return res.status(400).json({
        error: "Falta configurar el ID del Sheet o de la pestaña."
      });
    }

    const resolvedToken = await resolveGoogleToken(activeToken);

    const localRunLogs: SyncLog[] = [];
    let quotaExceeded = false;
    const addLog = (type: "info" | "success" | "warn" | "error", message: string) => {
      const logItem: SyncLog = { timestamp: new Date().toISOString(), type, message };
      localRunLogs.push(logItem);
      systemLogs.unshift(logItem); // Keep history in system status
      console.log(`[${type.toUpperCase()}] ${message}`);
    };

    addLog("info", `Iniciando proceso de sincronización para fecha local: ${currentLocalDate}`);
    addLog("info", `Buscando filtros en Gmail: "${searchQuery}"`);

    try {
      // 1. Calculate an after query to minimize Gmail results (e.g. yesterday and today)
      // Since we strictly want alerts from 'today' we search from yesterday onwards
      const localDateObj = new Date(currentLocalDate);
      const yesterdayObj = new Date(localDateObj);
      yesterdayObj.setDate(yesterdayObj.getDate() - 1);
      
      const pad = (n: number) => n.toString().padStart(2, "0");
      const yesterdayStr = `${yesterdayObj.getFullYear()}/${pad(yesterdayObj.getMonth() + 1)}/${pad(yesterdayObj.getDate())}`;
      
      const fullGmailQuery = `${searchQuery} after:${yesterdayStr}`;
      addLog("info", `Query completo Gmail: "${fullGmailQuery}"`);

      // 2. Fetch list of messages
      const gmailListUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(fullGmailQuery)}&maxResults=20`;
      const listRes = await fetch(gmailListUrl, {
        headers: { Authorization: `Bearer ${resolvedToken}` }
      });

      if (!listRes.ok) {
        const errorDetail = await listRes.text();
        let displayError = "No se pudo leer la lista de correos de Gmail. Verifica tus credenciales.";
        if (listRes.status === 403 || errorDetail.includes("insufficient")) {
          displayError = "⚠️ Permisiones Insuficientes (Gmail): Tu token de Google no cuenta con el permiso para leer el correo ('https://www.googleapis.com/auth/gmail.readonly'). Si usas Bypass, verifica que el GOOGLE_REFRESH_TOKEN fue generado incluyendo el scope de Gmail. Si iniciaste sesión manualmente, asegúrate de marcar 'Ver tus mensajes de correo electrónico' en la pantalla de autorización de Google.";
        }
        addLog("error", `Error al listar mensajes en Gmail: ${displayError} Detalle técnico: ${errorDetail}`);
        return res.status(listRes.status).json({
          error: displayError
        });
      }

      const listData = await listRes.json();
      const messages = listData.messages || [];
      addLog("info", `Encontrados ${messages.length} correos base para inspeccionar con filtros de fecha.`);

      let stats = {
        totalFound: messages.length,
        processed: 0,
        relevantFoundToday: 0,
        newAdded: 0,
        duplicatesIgnored: 0,
        errorsCount: 0
      };

      const alertsResults: Alert[] = [];

      // 3. Process each message
      for (const msg of messages) {
        try {
          stats.processed++;
          let subject = "";
          let from = "";
          let bodyPayload = { body: "", mimeType: "text/plain" };
          let targetNewsUrl = "";
          let scrapedNewsText = "";

            addLog("info", `Iniciando análisis de correo [ID: ${msg.id}] (${stats.processed}/${messages.length})...`);

            const msgDetailUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
            const detailRes = await fetch(msgDetailUrl, {
              headers: { Authorization: `Bearer ${resolvedToken}` }
            });

            if (!detailRes.ok) {
              addLog("warn", `No se pudo obtener detalles del correo [ID: ${msg.id}].`);
              stats.errorsCount++;
              continue;
            }

            const messageDetail = await detailRes.json();
            const headers = messageDetail.payload.headers || [];

            subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "(Sin asunto)";
            from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "(Remitente desconocido)";

            // Traverse parts for text body or HTML
            bodyPayload = messageDetail.payload.parts 
              ? getEmailContent(messageDetail.payload.parts)
              : { body: decodeBase64Url(messageDetail.payload.body?.data || ""), mimeType: "text/plain" };

            // Extract links inside body (we'll process them in the loops below)
            const bodyUrls = extractUrls(bodyPayload.body);
            if (bodyUrls.length > 0) {
              targetNewsUrl = bodyUrls[0];
            }

          // Apply subject validation checks to discard "tangencial" alerts and restrict to requested search scopes
          const subjectLower = subject.toLowerCase();
          
          if (subjectLower.includes("tangencial") || subjectLower.includes("tangenciales")) {
            addLog("warn", `Correo ignorado por término "tangencial" en asunto: "${subject}"`);
            continue;
          }

          const allowedKeywords = [
            "google alert", 
            "alerta de google", 
            "intrant", 
            "morrison", 
            "milton morrison", 
            "celso marranzini", 
            "celso juan marranzini", 
            "marranzini"
          ];
          const hasKeyword = allowedKeywords.some(keyword => subjectLower.includes(keyword));
          if (!hasKeyword) {
            addLog("warn", `Correo ignorado por no contener términos obligatorios (Google Alerts/Intrant/Morrison/Marranzini). Asunto: "${subject}"`);
            continue;
          }

          // Gather all unique URLs to process individually (limiting to top 3 unique links to prevent timeouts/quota exhaustion)
          const urls = extractUrls(bodyPayload.body);
          const uniqueUrls = Array.from(new Set(urls)).slice(0, 3);
          addLog("info", `Se encontraron ${uniqueUrls.length} enlaces válidos en este correo para su evaluación individual.`);

          const processNewsItem = async (newsUrl: string, scrapedText: string) => {
            // Let Gemini detect, analyze, and filter for today & INTRANT / Celso Marranzini / Milton Morrison
            addLog("info", `Invocando a modelo 'El Águila' (Gemini-3.5-flash) para auditar autenticidad de fecha y término.`);
            let geminiAnalysis = null;
            try {
              geminiAnalysis = await analyzeAlertWithGemini(
                subject,
                from,
                bodyPayload.body,
                scrapedText,
                currentLocalDate
              );
            } catch (geminiErr: any) {
              const errMsg = geminiErr.message || "";
              const isQuotaErr = errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED");
              if (isQuotaErr) {
                quotaExceeded = true;
                addLog("error", `⚠️ [LÍMITE DE CUOTA GEMINI EXCEDIDO (429)]: Has agotado el límite de cuota gratuita para 'gemini-3.5-flash' (máximo 20 peticiones diarias en cuenta gratuita).`);
                addLog("warn", `Para solucionar esto, por favor abre 'Settings > Secrets' o ve a la parte superior de la app para habilitar la Cuota de Pago/Facturación.`);
              } else {
                addLog("error", `Fallo crítico de Gemini al procesar elemento con Asunto del correo: "${subject}". Error: ${errMsg}`);
              }
              stats.errorsCount++;
              return;
            }

            if (!geminiAnalysis) {
              addLog("error", `Fallo crítico de Gemini al procesar elemento con Asunto del correo: "${subject}"`);
              stats.errorsCount++;
              return;
            }

            const alertTemp: Alert = {
              id: `${msg.id}-${newsUrl ? Buffer.from(newsUrl).toString('base64').substring(0, 8) : 'raw'}`,
              subject: geminiAnalysis.subject,
              sender: geminiAnalysis.senderName,
              originalDate: geminiAnalysis.originalPublicationDate,
              processedDate: currentLocalDate,
              content: geminiAnalysis.contentSummary,
              newsUrl: geminiAnalysis.extractedNewsUrl || newsUrl || "",
              otherData: geminiAnalysis.additionalKeyFacts,
              sentiment: geminiAnalysis.sentiment || "Neutral",
              status: "pending"
            };

            // Validate news today and relevance filter (including Celso Marranzini)
            if (!geminiAnalysis.isRelevantAlerta) {
              addLog("warn", `Elemento descartado: No se detecta relevancia con INTRANT, Milton Morrison o Celso Marranzini. Título: "${geminiAnalysis.subject}"`);
              alertTemp.status = "pending";
              alertTemp.statusDetails = "Descartado: Sin relevancia";
              alertsResults.push(alertTemp);
              return;
            }

            if (onlyToday && !geminiAnalysis.isFromToday) {
              addLog("warn", `Elemento descartado: Corresponde a la fecha ${geminiAnalysis.originalPublicationDate}, que no es del día de hoy (${currentLocalDate}).`);
              alertTemp.status = "pending";
              alertTemp.statusDetails = `Descartado: Fecha incorrecta (${geminiAnalysis.originalPublicationDate})`;
              alertsResults.push(alertTemp);
              return;
            }

            stats.relevantFoundToday++;
            addLog("success", `[RELEVANTE] Nueva relación detectada: "${geminiAnalysis.subject}" para la fecha ${geminiAnalysis.originalPublicationDate}`);

            // Now synchronize to Google Sheets
            addLog("info", `Guardando fila correspondiente en Google Sheets (Spreadsheet: ${spreadsheetId})...`);
            const writeRes = await syncAlertToSheet(
              resolvedToken,
              spreadsheetId,
              sheetName,
              geminiAnalysis,
              msg.id
            );

            if (!writeRes.success) {
              addLog("error", `Error al guardar en el Sheet: ${writeRes.detail}`);
              alertTemp.status = "error";
              alertTemp.statusDetails = writeRes.detail;
              stats.errorsCount++;
            } else if (writeRes.isDuplicate) {
              const rowInfo = writeRes.rowNumber ? ` (Fila ${writeRes.rowNumber})` : "";
              addLog("warn", `Alerta ya registrada con anterioridad (Duplicada)${rowInfo}. Ignorado para evitar duplicado. Asunto: "${geminiAnalysis.subject}"`);
              alertTemp.status = "duplicate";
              alertTemp.statusDetails = `Registro Duplicado Omitido ${rowInfo}`.trim();
              alertTemp.rowNumber = writeRes.rowNumber;
              stats.duplicatesIgnored++;
            } else {
              const rowInfo = writeRes.rowNumber ? ` en Fila ${writeRes.rowNumber}` : "";
              addLog("success", `Alerta registrada satisfactoriamente en el Google Sheet${rowInfo}! Asunto: "${geminiAnalysis.subject}"`);
              alertTemp.status = "success";
              alertTemp.statusDetails = `Registrada con éxito${rowInfo}`.trim();
              alertTemp.rowNumber = writeRes.rowNumber;
              stats.newAdded++;
            }

            alertsResults.push(alertTemp);
          };

          if (uniqueUrls.length === 0) {
            addLog("info", `Procesando correo directo sin enlaces correspondientes.`);
            await processNewsItem("", "");
          } else {
            for (let i = 0; i < uniqueUrls.length; i++) {
              const currentUrl = uniqueUrls[i];
              addLog("info", `Procesando enlace de noticia [${i + 1}/${uniqueUrls.length}]: ${currentUrl}`);
              let scrapedText = "";
              scrapedText = await scrapeNewsUrl(currentUrl);
              if (scrapedText) {
                addLog("info", `Scraping exitoso de enlace de noticia (${scrapedText.substring(0, 80)}...)`);
              } else {
                addLog("warn", `No se pudo obtener detalles de texto del enlace de noticia.`);
              }
              await processNewsItem(currentUrl, scrapedText);
            }
          }
        } catch (itemErr: any) {
          addLog("error", `Error de procesamiento individual de correo [ID: ${msg.id}]: ${itemErr.message}`);
          stats.errorsCount++;
        }
      }

      addLog("success", `Proceso finalizado. Total evaluados: ${stats.processed}. Relevantes hoy: ${stats.relevantFoundToday}. Agregados: ${stats.newAdded}. Duplicados omitidos: ${stats.duplicatesIgnored}. Errores: ${stats.errorsCount}.`);

      return res.json({
        success: true,
        stats,
        alerts: alertsResults,
        logs: localRunLogs,
        quotaExceeded
      });
    } catch (syncErr: any) {
      addLog("error", `Fallo general en la operación de sincronización: ${syncErr.message}`);
      return res.status(500).json({ error: syncErr.message || "Error general del motor de sincronización." });
    }
  });

  // Vite Integration for Hot-Module-Replacement / Asset building
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets compiled inside dist/
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to 0.0.0.0 and port 3000 as required
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
