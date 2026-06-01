import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini SDK with telemetry header
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper to decode Gmail's base64url content safely
export function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// Find HTTP/HTTPS urls in email text, filtering out standard trackers or social media
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>\)^]+/gi;
  const urls: string[] = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const lowerUrl = url.toLowerCase();
    
    // Ignore static image files, static tracking media, etc.
    const isStaticOrBinary = 
      lowerUrl.endsWith('.png') || 
      lowerUrl.endsWith('.jpg') || 
      lowerUrl.endsWith('.jpeg') || 
      lowerUrl.endsWith('.gif') || 
      lowerUrl.endsWith('.svg') || 
      lowerUrl.endsWith('.ico') || 
      lowerUrl.endsWith('.webp') || 
      lowerUrl.endsWith('.css') || 
      lowerUrl.endsWith('.js') || 
      lowerUrl.endsWith('.pdf');

    if (isStaticOrBinary) {
      continue;
    }

    // Filter out common tracking or non-news links to optimize target fetching
    const blockList = [
      'google.com', 'gmail.com', 'facebook.com', 'twitter.com', 'instagram.com',
      'youtube.com', 'linkedin.com', 'pinterest.com', 'unsplash.com', 'schema.org',
      'w3.org', 'doubleclick.net', 'googletagmanager.com', 'google-analytics.com',
      'gstatic.com', 'googleusercontent.com', 'sendibt2.com', 'sendibt3.com', 'sendibt.com',
      'brevo.net', 'sib.com', 't.me/alertasintrant', 'telegram.me/alertasintrant'
    ];

    if (!blockList.some(blocked => lowerUrl.includes(blocked))) {
      // Clean trailing period or comma
      const cleanUrl = url.replace(/[,.]$/, '');
      if (!urls.includes(cleanUrl)) {
        urls.push(cleanUrl);
      }
    }
  }
  return urls;
}

// Fetch and scrape visible text from a news webpage with a timeout
export async function scrapeNewsUrl(url: string): Promise<string> {
  try {
    const response = await Promise.race([
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
        }
      }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Scrape timeout')), 3000))
    ]);

    if (!response.ok) return '';

    // Check content-type to reject non-text responses (like images, zip files, tracking response pixels, etc.)
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/') && !contentType.toLowerCase().includes('json') && !contentType.toLowerCase().includes('xml')) {
      console.warn(`Scraping de URL omitido por tipo de contenido no compatible: ${contentType}`);
      return '';
    }

    const html = await response.text();

    // Perform basic stripping of script/style tags and grab text
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Return the first 3000 characters
    return cleanHtml.substring(0, 3000);
  } catch (error) {
    console.error(`Error scraping URL ${url}:`, error);
    return '';
  }
}

// Recursively traverse Gmail message parts to extract full email body (prefer HTML, fallback to text)
export function getEmailContent(parts: any[]): { body: string; mimeType: string } {
  let textContent = '';
  let htmlContent = '';

  function processParts(partList: any[]) {
    for (const part of partList) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        textContent += decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        htmlContent += decodeBase64Url(part.body.data);
      } else if (part.parts) {
        processParts(part.parts);
      }
    }
  }

  processParts(parts);
  
  if (htmlContent) {
    return { body: htmlContent, mimeType: 'text/html' };
  }
  return { body: textContent, mimeType: 'text/plain' };
}

// Structured output schema for alert identification & extraction
export interface ParsedAlertPayload {
  isRelevantAlerta: boolean;
  subject: string;
  senderName: string;
  originalPublicationDate: string; // YYYY-MM-DD
  isFromToday: boolean;
  contentSummary: string;
  extractedNewsUrl: string;
  additionalKeyFacts: string;
  sentiment: string; // Tonal feedback (Positivo, Neutral, Negativo)
}

// Helper to sanitize texts by removing binary sequences, unprintable ASCII characters, or image artifact noise
export function sanitizeText(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "") // remove non-printable ASCII control chars
    .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u017F\u0180-\u024F\u2013\u2014\u201C\u201D\u201E\u201F]/g, " ") // replace exotic binary noise with simple spaces
    .replace(/\s+/g, " ")
    .trim();
}

// Call Gemini 3.5 Flash to classify and parse email and its scraped contents
export async function analyzeAlertWithGemini(
  emailSubject: string,
  emailFrom: string,
  emailBody: string,
  scrapedNewsText: string,
  currentLocalDateString: string // YYYY-MM-DD format
): Promise<ParsedAlertPayload | null> {
  const cleanBody = sanitizeText(emailBody).substring(0, 5000);
  const cleanScraped = sanitizeText(scrapedNewsText).substring(0, 3000);

    const prompt = `
Analiza el siguiente correo recibido y/o noticia externa asociada.

La fecha actual de verificación del sistema es: ${currentLocalDateString}

Información del correo original:
- Asunto: "${emailSubject}"
- Remitente: "${emailFrom}"
- Contenido del correo:
"""
${cleanBody}
"""

Contenido raspado de la posible página de noticias externa de la alerta (opcional):
"""
${cleanScraped}
"""

Instrucciones:
1. Determina si este contenido es una alerta o noticia relevante relacionada DIRECTAMENTE con el INTRANT (Instituto Nacional de Tránsito y Transporte Terrestre en República Dominicana), con "Milton Morrison" (Director de dicha entidad) o con "Celso Marranzini" (destacado líder empresarial y funcionario, Presidente del Consejo de las EDES / CUED en la República Dominicana).
2. Determina si el evento, el correo, o la noticia descrita ocurrieron o fueron publicados HOY, en la fecha "${currentLocalDateString}".
   - "El águila debe revisar los correos y solo guardar en el archivo los que sean del día. Nunca poner noticias que no sean del mismo día."
   - Asegúrate de verificar las fechas mencionadas en el texto del correo o en el texto extraído de la noticia. Si el hecho reportado o la publicación no corresponde a HOY (${currentLocalDateString}), marca 'isFromToday' como false.
3. Determina el tono o sentimiento predominante encaminado hacia la institución o el funcionario referido. Debe ser exactamente: 'Positivo', 'Neutral' o 'Negativo'.
4. Extrae la información estructurada de manera lógica.
5. EXTRACCIÓN DEL TÍTULO (IMPORTANTE): Extrae el titular o título individual de la noticia o artículo de prensa real analizado para el campo 'subject'. NO uses palabras clave genéricas como 'INTRANT' ni el asunto del boletín (como 'Alerta de Google - INTRANT').
6. EXTRACCIÓN DEL CONTENIDO (IMPORTANTE): Escribe un resumen de texto sucinto pero descriptivo de las noticias para el campo 'contentSummary'. Empieza inmediatamente con el contenido. NUNCA repitas el titular ni uses cochetes (como [TÍTULO]) ni emojis semáforos en este campo.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `Eres un analista de datos de prensa experto cuyo alias de vigilancia es "El Águila". Tu trabajo es clasificar correos de alertas entrantes referentes al INTRANT, Milton Morrison o Celso Marranzini en República Dominicana.
Debes extraer la información con precisión absoluta, asegurándote de descartar cualquier correo o noticia que no coincida exactamente con la fecha del día que te indique la llamada (debes comparar sistemáticamente con la fecha proporcionada). Solo aprueba como isRelevantAlerta y isFromToday si la fecha de la noticia o del correo corresponde exactamente a la misma fecha indicada de hoy.

Devuelve tus hallazgos estrictamente en JSON con la estructura solicitada.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isRelevantAlerta: {
              type: Type.BOOLEAN,
              description: "Indica si se trata sobre INTRANT, Milton Morrison o Celso Marranzini y es una noticia/alerta de interés relevante."
            },
            subject: {
              type: Type.STRING,
              description: "El título o titular real, limpio, específico e individual de la noticia de prensa analizada (ej: 'Sectores respaldan medidas de Milton Morrison en INTRANT' o 'Celso Marranzini expone plan para reducir apagones'). Nunca uses el término genérico de búsqueda 'INTRANT' ni el asunto del correo 'Alerta de Google' aquí."
            },
            senderName: {
              type: Type.STRING,
              description: "Nombre o entidad limpia del remitente original del correo, o el medio de prensa (ej: Diario Libre, Listín Diario, Redacción, etc.)."
            },
            originalPublicationDate: {
              type: Type.STRING,
              description: "Fecha original del evento/correo/noticia en formato YYYY-MM-DD."
            },
            isFromToday: {
              type: Type.BOOLEAN,
              description: "Estricto: true únicamente si la alerta u hora de noticia corresponde exactamente a la fecha de hoy indicada por el sistema."
            },
            contentSummary: {
              type: Type.STRING,
              description: "Resumen o texto de contenido limpio, breve, descriptivo e inmediato de la noticia. Comienza directamente con los hechos. NUNCA agregues un prefijo con el título entre corchetes, ni uses emojis (como semáforos 🚦) o asteriscos en este resumen."
            },
            extractedNewsUrl: {
              type: Type.STRING,
              description: "El enlace principal o URL de la noticia si se detecta en el correo o noticia raspada."
            },
            additionalKeyFacts: {
              type: Type.STRING,
              description: "Cualesquiera otros datos clave o relevantes extraídos de la alerta (por ejemplo: nombres involucrados, multas, cierres, comunicados, ubicaciones)."
            },
            sentiment: {
              type: Type.STRING,
              description: "Sentimiento o tono de la noticia. Debe ser exactamente una de estas tres palabras: 'Positivo', 'Neutral' o 'Negativo'."
            }
          },
          required: [
            "isRelevantAlerta",
            "subject",
            "senderName",
            "originalPublicationDate",
            "isFromToday",
            "contentSummary",
            "extractedNewsUrl",
            "additionalKeyFacts",
            "sentiment"
          ]
        }
      }
    });

    let textResponse = response.text?.trim() || "";
    if (textResponse.startsWith("```")) {
      textResponse = textResponse.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const parsed = JSON.parse(textResponse);
    return parsed as ParsedAlertPayload;
  } catch (error: any) {
    console.error("Error analyzing warning with Gemini:", error);
    throw new Error(`Gemini Error: ${error?.message || error}`);
  }
}

// Intelligent Google Sheet syncing helper
export async function syncAlertToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  alert: ParsedAlertPayload,
  gmailMessageId: string
): Promise<{ success: boolean; isDuplicate: boolean; detail?: string; rowNumber?: number }> {
  if (!accessToken || accessToken === "bypass" || accessToken === "mock" || spreadsheetId === "mock-sheet") {
    // Return successful simulation values
    const randomRow = Math.floor(Math.random() * 80) + 5;
    return {
      success: true,
      isDuplicate: false,
      rowNumber: randomRow,
      detail: "Sincronizado con éxito en hoja de cálculo simulada"
    };
  }

  try {
    const encodedSheetName = encodeURIComponent(sheetName);
    
    // 1. Fetch current sheet to extract headers (and check credentials)
    const readHeadersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A1:Z1`;
    const readRes = await fetch(readHeadersUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!readRes.ok) {
      if (readRes.status === 404) {
        return { success: false, isDuplicate: false, detail: 'Spreadsheet or Sheet Name not found.' };
      }
      const errText = await readRes.text();
      return { success: false, isDuplicate: false, detail: `Google Sheets API Error (${readRes.status}): ${errText}` };
    }

    const { values: headerRows } = await readRes.json();
    const headers: string[] = headerRows && headerRows.length > 0 ? headerRows[0] : [];

    // Define standard fallback headers if the sheet is completely blank.
    // Column P corresponds to index 15. We define headers up to Column P (index 15 = 'Procedencia de Alerta').
    const defaultHeaders = new Array(16).fill('');
    defaultHeaders[0] = 'Fecha Alerta';
    defaultHeaders[1] = 'Asunto';
    defaultHeaders[2] = 'Remitente';
    defaultHeaders[3] = 'Contenido Principal';
    defaultHeaders[4] = 'Enlace Noticia / URL';
    defaultHeaders[5] = 'Otros Datos Clave';
    defaultHeaders[6] = 'ID de Alerta (Gmail ID)';
    defaultHeaders[7] = 'Sentimiento';
    defaultHeaders[15] = 'Procedencia de Alerta';

    let finalHeaders = [...headers];
    if (finalHeaders.length === 0) {
      // Sheet is empty, initialize headers
      const updateHeadersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A1?valueInputOption=USER_ENTERED`;
      const upHeadersRes = await fetch(updateHeadersUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `${sheetName}!A1`,
          majorDimension: 'ROWS',
          values: [defaultHeaders]
        })
      });
      if (!upHeadersRes.ok) {
        return { success: false, isDuplicate: false, detail: 'Could not create original headers.' };
      }
      finalHeaders = defaultHeaders;
    }

    // 2. Fetch the entire column containing key IDs or emails to check for duplicates
    // We check all rows.
    const readAllUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A:Z`;
    const readAllRes = await fetch(readAllUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const { values: allRows } = await readAllRes.json();

    // Check if duplicate alert exists
    let gmailIdColIndex = finalHeaders.findIndex(h => h.toLowerCase().includes('id de alerta') || h.toLowerCase().includes('gmail id') || h.toLowerCase().includes('message id'));
    let subjectColIndex = finalHeaders.findIndex(h => h.toLowerCase().includes('asunto') || h.toLowerCase().includes('título') || h.toLowerCase().includes('subject') || h.toLowerCase().includes('titular'));
    let urlColIndex = finalHeaders.findIndex(h => h.toLowerCase().includes('enlace') || h.toLowerCase().includes('url') || h.toLowerCase().includes('link') || h.toLowerCase().includes('noticia'));

    let isDuplicate = false;
    let duplicateRowIndex = -1;
    if (allRows && allRows.length > 1) {
      isDuplicate = allRows.slice(1).some((row: any[], i: number) => {
        let match = false;
        
        const rowGmailId = gmailIdColIndex >= 0 ? row[gmailIdColIndex] : "";
        const rowSubject = subjectColIndex >= 0 ? row[subjectColIndex]?.toString().trim().toLowerCase() : "";
        const rowUrl = urlColIndex >= 0 ? row[urlColIndex]?.toString().trim() : "";

        const currentSubject = alert.subject.trim().toLowerCase();
        const currentUrl = alert.extractedNewsUrl ? alert.extractedNewsUrl.trim() : "";

        // Case 1: The external news URL matches exactly
        if (rowUrl && currentUrl && rowUrl === currentUrl) {
          match = true;
        }
        // Case 2: The subject/title/titular matches exactly
        else if (rowSubject && rowSubject === currentSubject) {
          match = true;
        }
        // Case 3: Both message ID AND the subject match
        else if (rowGmailId && rowGmailId === gmailMessageId && rowSubject === currentSubject) {
          match = true;
        }

        if (match) {
          duplicateRowIndex = i; // Index inside allRows.slice(1) is i, which corresponds to Sheet spreadsheet row i + 2
          return true;
        }
        return false;
      });
    }

    if (isDuplicate) {
      return { success: true, isDuplicate: true, rowNumber: duplicateRowIndex + 2 };
    }

    // 3. Construct row mapped dynamically to matching existing column positions
    // Column P corresponds to index 15. We make sure our payload is at least 16 columns wide.
    const targetLength = Math.max(finalHeaders.length, 16);
    const newRowData = new Array(targetLength).fill('');
    
    // Fill in values strictly based on derived headers positions
    const extractMediaFromUrl = (urlStr: string, fallback: string): string => {
      if (!urlStr) return fallback;
      try {
        const hostname = new URL(urlStr).hostname.toLowerCase();
        const domain = hostname.replace('www.', '');
        if (domain.includes('diariolibre.com')) return 'Diario Libre';
        if (domain.includes('listindiario.com') || domain.includes('listin.com.do')) return 'Listín Diario';
        if (domain.includes('elnacional.com.do') || domain.includes('elnacional.com')) return 'El Nacional';
        if (domain.includes('hoy.com.do')) return 'Hoy';
        if (domain.includes('elcaribe.com.do')) return 'El Caribe';
        if (domain.includes('eldia.com.do')) return 'El Día';
        if (domain.includes('acento.com.do')) return 'Acento';
        if (domain.includes('remolacha.net')) return 'Remolacha';
        if (domain.includes('noticiassin.com')) return 'Noticias SIN';
        
        const parts = domain.split('.');
        if (parts.length > 0) {
          const siteName = parts[0];
          return siteName.charAt(0).toUpperCase() + siteName.slice(1);
        }
        return domain;
      } catch (err) {
        return fallback;
      }
    };

    finalHeaders.forEach((header, idx) => {
      // Normalize to remove accents/diacritics (e.g. 'título' -> 'titulo') and trim spaces
      const cleanHeader = header
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (cleanHeader.includes('fecha')) {
        newRowData[idx] = alert.originalPublicationDate;
      } else if (
        cleanHeader.includes('asunto') || 
        cleanHeader.includes('titulo') || 
        cleanHeader.includes('subject') || 
        cleanHeader.includes('titular') || 
        cleanHeader.includes('headline')
      ) {
        newRowData[idx] = alert.subject;
      } else if (
        cleanHeader.includes('remitente') || 
        cleanHeader.includes('de:') || 
        cleanHeader.includes('sender') || 
        cleanHeader.includes('autor') || 
        cleanHeader.includes('periodista') ||
        cleanHeader.includes('reportero')
      ) {
        newRowData[idx] = alert.senderName;
      } else if (
        cleanHeader.includes('contenido') || 
        cleanHeader.includes('texto') || 
        cleanHeader.includes('descripcion') || 
        cleanHeader.includes('cuerpo') || 
        cleanHeader.includes('summary') || 
        cleanHeader.includes('resumen')
      ) {
        newRowData[idx] = alert.contentSummary;
      } else if (
        cleanHeader.includes('enlace') || 
        cleanHeader.includes('url') || 
        cleanHeader.includes('link') || 
        cleanHeader.includes('noticia')
      ) {
        newRowData[idx] = alert.extractedNewsUrl;
      } else if (
        cleanHeader.includes('medio') || 
        cleanHeader.includes('fuente') || 
        cleanHeader.includes('prensa') || 
        cleanHeader.includes('source') || 
        cleanHeader.includes('editorial') || 
        cleanHeader.includes('publicador')
      ) {
        newRowData[idx] = extractMediaFromUrl(alert.extractedNewsUrl, alert.senderName);
      } else if (
        cleanHeader.includes('datos') || 
        cleanHeader.includes('hechos') || 
        cleanHeader.includes('fact') || 
        cleanHeader.includes('extra')
      ) {
        newRowData[idx] = alert.additionalKeyFacts;
      } else if (cleanHeader.includes('id') || cleanHeader.includes('gmail')) {
        newRowData[idx] = gmailMessageId;
      } else if (
        cleanHeader.includes('sentimiento') || 
        cleanHeader.includes('sentiment') || 
        cleanHeader.includes('tono')
      ) {
        newRowData[idx] = alert.sentiment || "Neutral";
      }
    });

    // If there were any unmatched headers or some missing items, double check standard filling
    let valuesToWrite = [...newRowData];
    if (newRowData.every((x, idx) => idx === 15 ? true : x === '')) {
      valuesToWrite = new Array(16).fill('');
      valuesToWrite[0] = alert.originalPublicationDate;
      valuesToWrite[1] = alert.subject;
      valuesToWrite[2] = alert.senderName;
      valuesToWrite[3] = alert.contentSummary;
      valuesToWrite[4] = alert.extractedNewsUrl;
      valuesToWrite[5] = alert.additionalKeyFacts;
      valuesToWrite[6] = gmailMessageId;
      valuesToWrite[7] = alert.sentiment || "Neutral";
    }

    // Explicitly enforce the "DESDE A" tag on Column P (index 15)
    valuesToWrite[15] = "DESDE A";

    // 4. Append row at the bottom of the Sheet using Google Sheets values append REST API
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: `${sheetName}!A1`,
        majorDimension: 'ROWS',
        values: [valuesToWrite]
      })
    });

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      return { success: false, isDuplicate: false, detail: `Append values failed: ${errText}` };
    }

    let rowNumber = allRows ? allRows.length + 1 : 2;
    try {
      const appendData = await appendRes.json();
      const updatedRange = appendData.updates?.updatedRange;
      if (updatedRange) {
        const rangePart = updatedRange.split('!')[1] || updatedRange;
        const numbers = rangePart.match(/\d+/g);
        if (numbers && numbers.length > 0) {
          rowNumber = parseInt(numbers[0], 10);
        }
      }
    } catch (e) {
      console.warn("Could not determine dynamic row number from sheets append response, layout estimate is used:", e);
    }

    return { success: true, isDuplicate: false, rowNumber };
  } catch (error: any) {
    console.error("Error committing row to Google Sheet:", error);
    return { success: false, isDuplicate: false, detail: error?.message || 'Error executing Sheet append row.' };
  }
}
