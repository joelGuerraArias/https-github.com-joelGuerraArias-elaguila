import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Eye,
  EyeOff,
  Globe,
  Activity,
  Database,
  Calendar,
  ArrowRight,
  Search,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Sliders,
  LogOut,
  ExternalLink,
  ShieldAlert,
  Terminal,
  Info,
  Clock,
  Play,
  Settings,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Mail,
  Trash2,
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  X,
  Bell,
  BellOff
} from "lucide-react";
import {
  initAuth,
  googleSignIn,
  logout
} from "./auth.js";
import { Alert, SyncLog } from "./types.js";
import { User } from "firebase/auth";

export default function App() {
  // Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Token expiration tracker
  const [tokenTimestamp, setTokenTimestamp] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const ts = localStorage.getItem("google_token_timestamp");
      return ts ? parseInt(ts, 10) : null;
    }
    return null;
  });

  const isTokenExpired = useMemo(() => {
    if (!token || !tokenTimestamp) return false;
    // Expired if greater than 55 minutes
    return Date.now() - tokenTimestamp > 55 * 60 * 1000;
  }, [token, tokenTimestamp]);

  const [bypassConfigured, setBypassConfigured] = useState(false);

  // Configuration (persisted in localStorage)
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    let stored = localStorage.getItem("intrant_spreadsheet_id") || "1zEhGX9aauTboEO8H7qEyqlCMzX8RKod6EEy81ZQpLhA";
    const trimmed = stored.trim();
    if (trimmed.includes("/spreadsheets/d/")) {
      const parts = trimmed.split("/spreadsheets/d/");
      if (parts[1]) {
        stored = parts[1].split("/")[0].split("?")[0].split("#")[0];
      }
    } else if (trimmed.includes("/spreadsheets/u/")) {
      const parts = trimmed.split("/spreadsheets/u/");
      if (parts[1]) {
        const subParts = parts[1].split("/d/");
        if (subParts[1]) {
          stored = subParts[1].split("/")[0].split("?")[0].split("#")[0];
        }
      }
    }
    return stored;
  });
  const [sheetName, setSheetName] = useState<string>(() => {
    return localStorage.getItem("intrant_sheet_name") || "Sheet1";
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return localStorage.getItem("intrant_search_query") || 'INTRANT OR Morrison OR "Milton Morrison" OR "Celso Marranzini"';
  });
  const [onlyToday, setOnlyToday] = useState<boolean>(() => {
    return localStorage.getItem("intrant_only_today") !== "false";
  });
  const [checkInterval, setCheckInterval] = useState<number>(() => {
    const saved = Number(localStorage.getItem("intrant_check_interval"));
    if ([15, 60, 240].includes(saved)) {
      return saved;
    }
    return 15; // default to 15 minutes
  });

  // Manual authentication state
  const [manualEmail, setManualEmail] = useState(() => {
    return localStorage.getItem("manual_google_email") || "";
  });
  const [manualToken, setManualToken] = useState(() => {
    return localStorage.getItem("manual_google_token") || "";
  });
  const [authTab, setAuthTab] = useState<"firebase" | "manual">("firebase");
  const [mainTab, setMainTab] = useState<"vigilance" | "sheet-news" | "chatbot">("vigilance");

  // System states
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeAutoMonitor, setActiveAutoMonitor] = useState<boolean>(() => {
    return localStorage.getItem("intrant_active_auto_monitor") === "true";
  });
  const [geminiQuotaExceeded, setGeminiQuotaExceeded] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const savedInterval = Number(localStorage.getItem("intrant_check_interval"));
    const interval = [15, 60, 240].includes(savedInterval) ? savedInterval : 15;
    return interval * 60;
  }); // seconds countdown for automatic interval
  const [scannedAlerts, setScannedAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetTesting, setSheetTesting] = useState(false);
  const [sheetTestMessage, setSheetTestMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(true);
  const [showDocPanel, setShowDocPanel] = useState(false);

  // Sheets available in spreadsheet
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);

  // Google Sheets news list
  const [sheetNews, setSheetNews] = useState<Array<{
    rowNumber: number;
    date: string;
    subject: string;
    sender: string;
    content: string;
    newsUrl: string;
    otherData: string;
  }>>([]);
  const [isFetchingSheetNews, setIsFetchingSheetNews] = useState(false);
  const [sheetNewsError, setSheetNewsError] = useState<string | null>(null);
  const [sheetNewsSearch, setSheetNewsSearch] = useState("");

  // System local date state (defaults to real today, customizable in UI)
  const [systemDate, setSystemDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  // Chat chatbot states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: "user" | "assistant"; text: string; timestamp: string }>>([
    {
      id: "welcome",
      role: "assistant",
      text: "¡Hola! Bienvenido a la central de vigilancia de prensa 'EL ÁGUILA'. Soy tu asistente virtual de prensa. ¿Qué te gustaría saber sobre el escáner de INTRANT, el historial de alertas, o la conexión con Google Workspace?",
      timestamp: new Date().toISOString()
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatTyping, setIsChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Native Notifications settings and permissions state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });
  
  const [isNotificationEnabled, setIsNotificationEnabled] = useState<boolean>(() => {
    return localStorage.getItem("el_aguila_notifications_enabled") === "true";
  });

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      addClientLog("error", "Este navegador no soporta la API de Notificaciones de escritorio.");
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setIsNotificationEnabled(true);
        localStorage.setItem("el_aguila_notifications_enabled", "true");
        addClientLog("success", "Permiso de notificaciones concedido para El Águila.");
        new Notification("🦅 El Águila - Alertas Activas", {
          body: "Recibirás avisos nativos inmediatos al detectar nuevas noticias de prensa de hoy.",
          icon: "/favicon.ico"
        });
      } else if (permission === "denied") {
        setIsNotificationEnabled(false);
        localStorage.setItem("el_aguila_notifications_enabled", "false");
        addClientLog("warn", "Permiso de notificaciones denegado. Habilítalo en el navegador.");
      }
    } catch (err: any) {
      addClientLog("error", `Error de permisos de notificación: ${err.message || err}`);
    }
  };

  const handleToggleNotifications = (checked: boolean) => {
    if (checked && notificationPermission !== "granted") {
      requestNotificationPermission();
    } else {
      setIsNotificationEnabled(checked);
      localStorage.setItem("el_aguila_notifications_enabled", checked ? "true" : "false");
      addClientLog("info", checked ? "Notificaciones nativas para nuevas alertas activadas." : "Notificaciones nativas desactivadas.");
    }
  };

  const testShowNotification = () => {
    if (!("Notification" in window)) {
      addClientLog("error", "Notificaciones no soportadas.");
      return;
    }
    if (Notification.permission !== "granted") {
      addClientLog("warn", "Debes activar o autorizar los permisos de notificación de tu navegador primero.");
      return;
    }

    new Notification("🦅 El Águila: Noticia de Alerta", {
      body: "[PRUEBA] Se ha insertado noticia relevante sobre INTRANT y Milton Morrison en tu Google Sheet.",
      icon: "/favicon.ico",
      tag: "el-aguila-test"
    });
    addClientLog("success", "Notificación nativa de prueba enviada satisfactoriamente.");
  };

  const sendAlertNotifications = (newAlerts: Alert[]) => {
    if (!isNotificationEnabled || Notification.permission !== "granted") return;
    
    const successAlerts = newAlerts.filter(a => a.status === "success");
    if (successAlerts.length === 0) return;

    if (successAlerts.length === 1) {
      const alert = successAlerts[0];
      new Notification("🦅 El Águila: Nueva Alerta Registrada", {
        body: `Fila #${alert.rowNumber || 'N/A'} - Asunto: ${alert.subject}\n\n${alert.content.substring(0, 80)}...`,
        icon: "/favicon.ico",
        tag: `alert-${alert.id || Date.now()}`
      });
    } else {
      new Notification(`🦅 ${successAlerts.length} Nuevas Alertas Grabadas`, {
        body: `Se han añadido ${successAlerts.length} nuevas noticias de prensa en tu hoja de cálculo Google Sheets.`,
        icon: "/favicon.ico",
        tag: `alerts-bulk-${Date.now()}`
      });
    }
  };

  // Auto scroll chat to the bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatOpen]);

  // Chat send message trigger
  const handleSendChatMessage = async (e?: any) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isChatTyping) return;

    const userMsgText = chatInput.trim();
    setChatInput("");

    const newUserMsg = {
      id: Math.random().toString(36).substring(7),
      role: "user" as const,
      text: userMsgText,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);
    setIsChatTyping(true);

    try {
      // Send historical messages for conversations context
      const historyContext = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyContext })
      });

      const data = await safeFetchJson(res, "chat");
      if (res.ok && data.success) {
        setChatMessages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            role: "assistant",
            text: data.text,
            timestamp: new Date().toISOString()
          }
        ]);
      } else {
        setChatMessages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            role: "assistant",
            text: `Lo siento, el sistema de \"El Águila\" detectó una interrupción: ${data.error || "Error de respuesta de servicios."}`,
            timestamp: new Date().toISOString()
          }
        ]);
      }
    } catch (err: any) {
      setChatMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          role: "assistant",
          text: `Error de red: No pude conectarme con el servicio de asistencia. (${err.message})`,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsChatTyping(false);
    }
  };

  // Terminal autoscroll reference
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Save configuration change helpers
  useEffect(() => {
    localStorage.setItem("intrant_spreadsheet_id", spreadsheetId);
  }, [spreadsheetId]);

  useEffect(() => {
    localStorage.setItem("intrant_sheet_name", sheetName);
  }, [sheetName]);

  useEffect(() => {
    localStorage.setItem("intrant_search_query", searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem("intrant_only_today", String(onlyToday));
  }, [onlyToday]);

  useEffect(() => {
    localStorage.setItem("intrant_check_interval", String(checkInterval));
    setTimeLeft(checkInterval * 60);
  }, [checkInterval]);

  useEffect(() => {
    localStorage.setItem("intrant_active_auto_monitor", String(activeAutoMonitor));
  }, [activeAutoMonitor]);

  // Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        const storedTs = localStorage.getItem("google_token_timestamp");
        setTokenTimestamp(storedTs ? parseInt(storedTs, 10) : Date.now());
        setAuthLoading(false);
        addClientLog("success", `Sesión establecida con éxito p/ ${currentUser.email}`);
        fetchServerLogs();
      },
      () => {
        const storedEmail = localStorage.getItem("manual_google_email");
        const storedToken = localStorage.getItem("manual_google_token");
        if (storedEmail && storedToken) {
          const mockUser = {
            email: storedEmail,
            photoURL: null,
            displayName: storedEmail.split("@")[0]
          } as unknown as User;
          setUser(mockUser);
          setToken(storedToken);
          setAuthLoading(false);
          addClientLog("success", `Sesión (Token Manual) recuperada del almacenamiento para: ${storedEmail}`);
          fetchServerLogs();
        } else {
          setUser(null);
          setToken(null);
          setAuthLoading(false);
          addClientLog("warn", "No hay credenciales activas del Workspace. Inicia sesión para continuar.");
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Helper to parse JSON safely and provide robust user-friendly alerts on API/Upstream errors
  const safeFetchJson = async (res: Response, endpointLabel: string): Promise<any> => {
    if (res.status === 401) {
      throw new Error(
        "Tu sesión de Google ha caducado (Google limita la validez de las credenciales de acceso a 60 minutos por razones de seguridad). Por favor, haz clic en 'Iniciar sesión con Google' para reactivar tu sesión fácilmente sin perder tu configuración."
      );
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      let errMsg = `Error de formato de servidor en el servicio: ${endpointLabel}.`;
      if (text.includes("upstream") || text.includes("gateway") || text.includes("502") || text.includes("503") || text.includes("504")) {
        errMsg = "⚠️ Se ha detectado una desconexión o micro-corte temporal del servidor de la nube (Error Upstream Gateway). Por favor, reintenta en unos instantes.";
      } else if (text.trim().startsWith("<!DOCTYPE html>") || text.trim().startsWith("<html")) {
        errMsg = "⚠️ El servidor web devolvió una página de error en lugar de datos JSON.";
      } else if (text.length > 0) {
        errMsg = `⚠️ Respuesta no procesable del servidor: ${text.slice(0, 150)}...`;
      }
      throw new Error(errMsg);
    }
  };

  // Fetch initial/stored server logging output
  const fetchServerLogs = async () => {
    try {
      const healthRes = await fetch("/api/health");
      if (healthRes.ok) {
        const healthData = await safeFetchJson(healthRes, "health");
        if (healthData && typeof healthData.bypassConfigured === "boolean") {
          setBypassConfigured(healthData.bypassConfigured);
        }
      }

      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await safeFetchJson(res, "logs");
        if (data.logs && data.logs.length > 0) {
          setLogs(data.logs);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch available sheet tabs of current spreadsheet
  const fetchAvailableSheets = async (currentToken: string = token || "") => {
    const activeToken = currentToken || token || (bypassConfigured ? "bypass" : "");
    if (!activeToken) {
      return;
    }
    if (!spreadsheetId.trim()) {
      return;
    }
    setIsLoadingSheets(true);
    addClientLog("info", `Cargando pestañas de la hoja de cálculo con ID: ${spreadsheetId}...`);
    try {
      const res = await fetch("/api/list-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: activeToken,
          spreadsheetId: spreadsheetId.trim()
        })
      });
      const data = await safeFetchJson(res, "list-sheets");
      if (res.ok && data.success) {
        setAvailableSheets(data.sheets || []);
        addClientLog("success", `Se cargaron ${data.sheets?.length || 0} pestañas del Google Sheet.`);
        // If current sheetName is not in the list, and list is not empty, auto-select first
        if (data.sheets && data.sheets.length > 0 && !data.sheets.includes(sheetName)) {
          setSheetName(data.sheets[0]);
        }
      } else {
        addClientLog("error", `Fallo al obtener pestañas: ${data.error || "Error desconocido"}`);
      }
    } catch (err: any) {
      addClientLog("error", `Error de red al listar pestañas: ${err.message}`);
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // Auto-fetch sheets on ID or token change
  useEffect(() => {
    const activeToken = token || (bypassConfigured ? "bypass" : "");
    if (activeToken && spreadsheetId.trim()) {
      fetchAvailableSheets(activeToken);
    }
  }, [spreadsheetId, token, bypassConfigured]);

  // Fetch lists of news already inserted in Google Sheets
  const fetchSheetNews = async (currentToken: string = token || "") => {
    const activeToken = currentToken || token || (bypassConfigured ? "bypass" : "");
    if (!activeToken) {
      return;
    }
    if (!spreadsheetId.trim() || !sheetName.trim() || sheetName === "__custom__") {
      return;
    }
    setIsFetchingSheetNews(true);
    setSheetNewsError(null);
    try {
      const res = await fetch("/api/get-sheet-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: activeToken,
          spreadsheetId: spreadsheetId.trim(),
          sheetName: sheetName.trim()
        })
      });
      const data = await safeFetchJson(res, "get-sheet-news");
      if (res.ok && data.success) {
        setSheetNews(data.news || []);
      } else {
        setSheetNewsError(data.error || "Fallo al leer las filas.");
      }
    } catch (err: any) {
      setSheetNewsError(err.message || "Error al conectar con el servidor.");
    } finally {
      setIsFetchingSheetNews(false);
    }
  };

  // Real-time synchronization of Sheets news entries
  useEffect(() => {
    const activeToken = token || (bypassConfigured ? "bypass" : "");
    if (activeToken && spreadsheetId.trim() && sheetName.trim() && sheetName !== "__custom__") {
      fetchSheetNews(activeToken);
    } else {
      setSheetNews([]);
    }
  }, [spreadsheetId, sheetName, token, bypassConfigured]);

  // Add client-side log directly to terminal list
  const addClientLog = (type: "info" | "success" | "warn" | "error", message: string) => {
    setLogs((prev) => [
      {
        timestamp: new Date().toISOString(),
        type,
        message
      },
      ...prev
    ]);
  };

  // Autoscroll terminal if needed
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Google Sign In trigger
  const handleLogin = async () => {
    setAuthLoading(true);
    addClientLog("info", "Iniciando ventana segura de acceso de Google...");
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setTokenTimestamp(Date.now());
        addClientLog("success", `Google Sign-In exitoso: ${res.user.email}`);
        setAuthLoading(false);
      }
    } catch (err: any) {
      addClientLog("error", `Fallo de autenticación: ${err.message || err}`);
      setAuthLoading(false);
    }
  };

  // Logout trigger
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setTokenTimestamp(null);
      setManualToken("");
      localStorage.removeItem("manual_google_email");
      localStorage.removeItem("manual_google_token");
      addClientLog("warn", "Sesión de Google Workspace desconectada.");
    } catch (err: any) {
      addClientLog("error", `Fallo al cerrar sesión: ${err.message}`);
    }
  };

  // Manual login process using user entered temporary token
  const handleManualConnect = () => {
    if (!manualEmail.trim() || !manualToken.trim()) {
      addClientLog("error", "Error: Se requiere ingresar el correo de Google y el Token de acceso.");
      return;
    }
    
    // Construct mock Firebase Auth-like User object for internal reactivity
    const mockUser = {
      email: manualEmail.trim(),
      photoURL: null,
      displayName: manualEmail.trim().split("@")[0]
    } as unknown as User;

    setUser(mockUser);
    setToken(manualToken.trim());
    localStorage.setItem("manual_google_email", manualEmail.trim());
    localStorage.setItem("manual_google_token", manualToken.trim());
    addClientLog("success", `¡Conexión manual establecida con éxito! Sesión activa para: ${manualEmail.trim()}`);
  };

  // Clean console logs both on backend and frontend
  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/logs/clear", { method: "POST" });
      if (res.ok) {
        const data = await safeFetchJson(res, "logs/clear");
        setLogs(data.logs);
      } else {
        setLogs([]);
        addClientLog("info", "Logs locales limpiados.");
      }
    } catch {
      setLogs([]);
    }
  };

  // Test active sheet connection & map existing columns
  const handleTestSheet = async () => {
    if (!token) {
      addClientLog("error", "Falta sesión activa. Inicie sesión primero.");
      return;
    }
    if (!spreadsheetId.trim()) {
      setSheetTestMessage({ success: false, text: "Introduzca un ID de Google Sheet válido." });
      return;
    }
    setSheetTesting(true);
    setSheetTestMessage(null);
    addClientLog("info", `Verificando acceso a Google Sheet con ID: ${spreadsheetId}...`);

    try {
      const res = await fetch("/api/sheet-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          spreadsheetId,
          sheetName
        })
      });

      const data = await safeFetchJson(res, "sheet-info");
      if (res.ok) {
        setSheetHeaders(data.headers);
        setSheetTestMessage({
          success: true,
          text: `¡Conexión establecida! Columnas detectadas: [${data.headers.join(", ") || "Ninguna, la hoja se inicializará con valores por defecto"}]`
        });
        addClientLog("success", `Prueba exitosa en Google Sheet. Columnas: ${data.headers.length}`);
      } else {
        setSheetTestMessage({
          success: false,
          text: data.error || "No se pudo conectar a la hoja de cálculo. Revisa que el ID y el nombre de la hoja estén bien escritos."
        });
        addClientLog("error", `La conexión al Google Sheet falló: ${data.error}`);
      }
    } catch (err: any) {
      setSheetTestMessage({
        success: false,
        text: `Error de red: ${err.message}`
      });
      addClientLog("error", `Fallo al conectar con Google Sheets API.`);
    } finally {
      setSheetTesting(false);
    }
  };

  // Core Sincronización execution trigger (supports manual & automatic check trigger)
  const triggerExchangeSync = async (isAuto: boolean = false) => {
    if (!token && !bypassConfigured) {
      if (authLoading) {
        addClientLog("info", "Esperando reinicio de credenciales de Google...");
        return;
      }
      addClientLog("warn", "⚠️ Vigilancia en pausa: Falta iniciar sesión con Google. Haz clic en 'Iniciar sesión con Google' para reactivarla.");
      return;
    }
    if (!spreadsheetId.trim()) {
      addClientLog("warn", "⚠️ Vigilancia en pausa: ID de Google Sheet no configurado.");
      return;
    }

    setIsSyncing(true);
    setGeminiQuotaExceeded(false);
    addClientLog("info", `Iniciando rastreadores ${isAuto ? "automáticos" : "manuales"} para el día de hoy (${systemDate})...`);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token || "bypass",
          spreadsheetId,
          sheetName,
          searchQuery,
          onlyToday,
          currentLocalDate: systemDate
        })
      });

      const data = await safeFetchJson(res, "sync");
      
      if (data.quotaExceeded) {
        setGeminiQuotaExceeded(true);
      }
      
      // Pull down updated logs from the server
      if (data.logs) {
        setLogs(data.logs);
      }

      if (res.ok) {
        if (data.alerts) {
          // Merge newly found alerts, preserving keys or updates
          setScannedAlerts((prev) => {
            const composite = [...data.alerts];
            // keep old alerts that were processed differently if needed
            prev.forEach((old) => {
              if (!composite.some((c) => c.id === old.id)) {
                composite.push(old);
              }
            });
            return composite;
          });

          // Trigger native browser notification for newly added alerts
          sendAlertNotifications(data.alerts);
        }
        addClientLog("success", `Sincronización concluida. Agregados hoy: ${data.stats?.newAdded || 0}, Ignorados (Duplicados): ${data.stats?.duplicatesIgnored || 0}`);
        // Refresh list of sheet-recorded news
        fetchSheetNews(token);
      } else {
        addClientLog("error", `Fallo del motor de sincronización: ${data.error || "Error indeterminado"}`);
      }
    } catch (err: any) {
      addClientLog("error", `Fallo crítico de red en el proceso: ${err.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Dynamic config for main sync button to guide the user under expired token or unlogged states
  const getSyncButtonConfig = () => {
    if (isSyncing) {
      return {
        text: "Procesando Correos de Hoy...",
        onClick: () => {},
        disabled: true,
        className: "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed opacity-75"
      };
    }
    if (!spreadsheetId || !spreadsheetId.toString().trim()) {
      return {
        text: "Falta Configurar Google Sheet ID",
        onClick: () => {},
        disabled: true,
        className: "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed opacity-75"
      };
    }
    if (token && !isTokenExpired) {
      return {
        text: "Sincronizar Alertas Ahora",
        onClick: () => triggerExchangeSync(false),
        disabled: false,
        className: "bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] active:translate-y-px text-white cursor-pointer shadow-lg shadow-emerald-950/20"
      };
    }
    if (bypassConfigured) {
      return {
        text: "Sincronizar Alertas Ahora (Bypass)",
        onClick: () => triggerExchangeSync(false),
        disabled: false,
        className: "bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] active:translate-y-px text-white cursor-pointer shadow-lg shadow-emerald-950/20"
      };
    }
    if (user) {
      return {
        text: "🔄 Renovar Sesión de Google para Sincronizar",
        onClick: handleLogin,
        disabled: false,
        className: "bg-amber-500 text-slate-950 border border-amber-600 hover:bg-amber-400 hover:scale-[1.01] active:translate-y-px cursor-pointer font-bold shadow-lg shadow-amber-950/20"
      };
    }
    return {
      text: "Conectar con Google para Sincronizar",
      onClick: handleLogin,
      disabled: false,
      className: "bg-blue-600 hover:bg-blue-500 hover:scale-[1.01] active:translate-y-px text-white cursor-pointer shadow-lg shadow-blue-950/20"
    };
  };

  // Countdown controller for periodic scans
  useEffect(() => {
    let timer: any = null;
    if (activeAutoMonitor && !isSyncing) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Trigger sync scan
            triggerExchangeSync(true);
            return checkInterval * 60; // reset
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeAutoMonitor, isSyncing, checkInterval, token, spreadsheetId]);

  // Format countdown string
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };



  return (
    <div className="min-h-screen font-sans bg-[#080d16] text-[#e2e8f0] pb-16">
      {/* Session Expired Banner */}
      {isTokenExpired && (
        <div className="bg-[#1c130c] border-b border-amber-500/25 text-amber-200 px-4 py-2.5 text-center text-xs flex flex-wrap justify-center items-center gap-2 md:gap-4 transition-all duration-300">
          <div className="flex items-center gap-1.5 justify-center">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 animate-pulse" />
            <span className="font-medium text-slate-200">
              Tu sesión de Google de 1 hora ha caducado. Habilita el bypass de fondo u oprime renovar para evitar pausas de vigilancia.
            </span>
          </div>
          <button
            onClick={handleLogin}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded transition-all hover:scale-[1.02] shadow cursor-pointer active:translate-y-px"
          >
            🔄 Renovar Sesión en 1 Clic
          </button>
        </div>
      )}

      {/* Header Bar */}
      <header className="border-b border-[#1e293b] bg-[#0c1322] sticky top-0 z-50 shadow-lg px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute flex h-3 w-3 top-0 right-0 -mr-1 -mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="p-2.5 bg-emerald-950/40 text-emerald-400 border border-emerald-800/50 rounded-xl">
                <Eye className="h-6 w-6 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-white tracking-tight flex items-center gap-2">
                EL ÁGUILA
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Sincronización de Vigilancia INTRANT &bull; Google Sheets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-3 py-1 bg-[#141d30] border border-slate-800 rounded-lg text-xs font-mono text-slate-400">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden md:inline">Fecha de Escaneo: </span>
              <input
                type="date"
                value={systemDate}
                onChange={(e) => {
                  setSystemDate(e.target.value);
                  addClientLog("info", `Fecha de escaneo ajustada a: ${e.target.value}`);
                }}
                className="bg-transparent border-none text-emerald-400 font-semibold outline-none cursor-pointer focus:ring-0 p-0 text-xs w-[115px]"
                title="Haz clic para cambiar la fecha de búsqueda/sincronización"
              />
            </div>

            {/* Auth Buttons */}
            {authLoading ? (
              <div className="h-10 w-36 bg-slate-800 animate-pulse rounded-lg"></div>
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-[#1e293b] rounded-lg">
                  {user.photoURL ? (
                    <img src={user.photoURL} className="w-5 h-5 rounded-full" alt="avatar" />
                  ) : (
                    <Mail className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="text-xs max-w-[140px] truncate font-medium text-slate-300">
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-rose-400 transition-colors bg-slate-900 border border-slate-800 hover:border-rose-950/50 rounded-lg hover:bg-rose-950/20"
                  title="Cerrar Sesión Workspace"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="gsi-material-button text-[#1f1f1f] bg-white border border-[#dadce0] hover:bg-[#f8f9fa] shadow-sm transition-all focus:outline-none"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "38px",
                  borderRadius: "8px",
                  padding: "0 16px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
              >
                <div className="gsi-material-button-content-wrapper flex items-center gap-2">
                  <div className="gsi-material-button-icon flex items-center justify-center">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">Conectar con Google</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Setup, Config, Automation and Documentation (7 grid steps) */}
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* Setup Dynamic Google Workspace Connection Panel */}
          {!user && (
            <div className="border border-slate-800 bg-[#0c1322] rounded-xl overflow-hidden shadow-lg">
              <div className="px-4 py-3 bg-[#111929] border-b border-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-4.5 h-4.5 text-emerald-400" />
                <span className="font-heading font-semibold text-white text-sm">Conectar Google Workspace</span>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex gap-1 bg-slate-950/45 p-1 rounded-lg border border-slate-850">
                  <button
                    onClick={() => setAuthTab("firebase")}
                    className={`flex-1 text-xs font-medium py-1.5 rounded transition ${
                      authTab === "firebase"
                        ? "bg-[#172236] text-emerald-400 font-semibold border-b border-emerald-500/35"
                        : "text-slate-450 hover:text-slate-300"
                    }`}
                  >
                    Inicio con Google
                  </button>
                  <button
                    onClick={() => setAuthTab("manual")}
                    className={`flex-1 text-xs font-medium py-1.5 rounded transition ${
                      authTab === "manual"
                        ? "bg-[#172236] text-emerald-400 font-semibold border-b border-emerald-500/35"
                        : "text-slate-450 hover:text-slate-300"
                    }`}
                  >
                    Token Manual (IFrame)
                  </button>
                </div>

                {authTab === "firebase" ? (
                  <div className="space-y-3.5">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Inicia sesión de Google mediante la ventana segura para habilitar de inmediato la búsqueda de alertas en Gmail y el registro automático en tu Google Sheet.
                    </p>
                    <button
                      onClick={handleLogin}
                      className="gsi-material-button w-full text-[#1f1f1f] bg-white hover:bg-[#f8f9fa] shadow-sm transition hover:scale-[1.01] flex items-center justify-center gap-2 rounded-lg py-2"
                      style={{ cursor: "pointer" }}
                    >
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                      <span className="text-xs font-semibold">Conectar con Google</span>
                    </button>
                    <p className="text-[10px] text-slate-500 leading-normal text-center">
                      Si los bloqueadores u otros bloqueos de iframe impiden que aparezca el popup, pulsa la pestaña "Token Manual".
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Inserta tus credenciales para registrarte y realizar búsquedas de forma local:
                    </p>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">
                          Dirección de correo electrónico (Gmail)
                        </label>
                        <input
                          type="email"
                          placeholder="ejemplo@gmail.com"
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          className="w-full text-xs font-mono bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-2.5 py-1.5 text-white outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1 flex justify-between">
                          <span>Token de Acceso de Google (OAuth2)</span>
                        </label>
                        <input
                          type="password"
                          placeholder="ya29.a0..."
                          value={manualToken}
                          onChange={(e) => setManualToken(e.target.value)}
                          className="w-full text-xs font-mono bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-2.5 py-1.5 text-white outline-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleManualConnect}
                      disabled={!manualEmail.trim() || !manualToken.trim()}
                      className="w-full text-xs font-semibold uppercase bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow transition-colors"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Conectar con Token</span>
                    </button>

                    <div className="bg-slate-950/60 border border-slate-850 p-2 text-[10px] leading-normal text-slate-400">
                      <p className="font-semibold text-slate-300 mb-0.5">💡 Obtener Token Fácilmente</p>
                      Crea un token temporal con permisos de Gmail y Sheets usando el 
                      <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-0.5 ml-1">
                        Google OAuth Playground <ExternalLink className="h-2.5 w-2.5" />
                      </a>.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Collapse Config Control */}
          <div className="border border-slate-800 bg-[#0c1322] rounded-xl overflow-hidden shadow-md">
            <div 
              onClick={() => setShowConfig(!showConfig)}
              className="flex justify-between items-center px-4 py-3 bg-[#111929] cursor-pointer hover:bg-[#141f33] transition"
            >
              <div className="flex items-center gap-2 text-white">
                <Settings className="w-4 h-4 text-emerald-400" />
                <span className="font-heading font-medium text-sm">Configuración de Vigilancia</span>
              </div>
              {showConfig ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            <AnimatePresence initial={false}>
              {showConfig && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-4 border-t border-slate-800 space-y-4 text-sm"
                >
                  {/* Google Sheet ID */}
                  <div>
                    <label className="block text-xs font-mono font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3 w-3 text-emerald-400" /> ID del Google Sheet
                    </label>
                    <input
                      type="text"
                      placeholder="Pega la URL de tu Google Sheet aquí..."
                      value={spreadsheetId}
                      onChange={(e) => {
                        let val = e.target.value.trim();
                        if (val.includes("/spreadsheets/d/")) {
                          const parts = val.split("/spreadsheets/d/");
                          if (parts[1]) {
                            val = parts[1].split("/")[0].split("?")[0].split("#")[0];
                            addClientLog("success", `ID de Google Sheet extraído de la URL.`);
                          }
                        } else if (val.includes("/spreadsheets/u/")) {
                          const parts = val.split("/spreadsheets/u/");
                          if (parts[1]) {
                            const subParts = parts[1].split("/d/");
                            if (subParts[1]) {
                              val = subParts[1].split("/")[0].split("?")[0].split("#")[0];
                              addClientLog("success", `ID de Google Sheet extraído de la URL.`);
                            }
                          }
                        }
                        setSpreadsheetId(val);
                      }}
                      className="w-full text-xs font-mono bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-3 py-2 text-white outline-none transition"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Puedes pegar la <b>URL completa de tu navegador</b> o el ID directamente.
                    </p>
                  </div>

                  {/* Sheet Page Name */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-mono font-medium text-slate-400 flex items-center gap-1.5">
                        <Sliders className="h-3 w-3 text-emerald-400" /> Pestaña de Destino (Hoja)
                      </label>
                        {token && spreadsheetId && (
                          <button
                            type="button"
                            onClick={() => fetchAvailableSheets(token)}
                            disabled={isLoadingSheets}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 disabled:opacity-50"
                          >
                            <RefreshCw className={`h-2.5 w-2.5 ${isLoadingSheets ? "animate-spin" : ""}`} />
                            <span>Actualizar</span>
                          </button>
                        )}
                      </div>
                      
                      {availableSheets.length > 0 ? (
                        <div className="space-y-2">
                          <select
                            value={sheetName}
                            onChange={(e) => setSheetName(e.target.value)}
                            className="w-full text-xs font-mono bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-3 py-2 text-white outline-none transition"
                          >
                            {availableSheets.map((name) => (
                              <option key={name} value={name} className="bg-[#0c1322] text-[#e2e8f0]">
                                {name}
                              </option>
                            ))}
                            <option value="__custom__" className="bg-[#0c1322] text-amber-400 font-semibold">
                              + Escribir nombre manual...
                            </option>
                          </select>
                          
                          {(sheetName === "__custom__" || !availableSheets.includes(sheetName)) && (
                            <div className="relative mt-1">
                              <input
                                type="text"
                                placeholder="Escribe el nombre de la pestaña..."
                                value={sheetName === "__custom__" ? "" : sheetName}
                                onChange={(e) => setSheetName(e.target.value)}
                                className="w-full text-xs font-mono bg-slate-900 border border-amber-900/40 focus:border-amber-500 rounded px-3 py-2 text-white outline-none transition"
                              />
                              <p className="text-[10px] text-amber-500/80 mt-1 pl-1">
                                Escribiendo pestaña personalizada. Asegúrate de que exista en el spreadsheet.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Ej: Sheet1 o Respuestas"
                            value={sheetName}
                            onChange={(e) => setSheetName(e.target.value)}
                            className="flex-1 text-xs font-mono bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-3 py-2 text-white outline-none transition"
                          />
                          {token && spreadsheetId && (
                            <button
                              type="button"
                              onClick={() => fetchAvailableSheets(token)}
                              disabled={isLoadingSheets}
                              className="bg-slate-900 hover:bg-slate-850 px-2.5 border border-slate-800 hover:border-slate-700 text-xs rounded text-slate-300 font-mono flex items-center justify-center transition-colors"
                              title="Buscar pestañas del documento"
                            >
                              <RefreshCw className={`h-3 w-3 ${isLoadingSheets ? "animate-spin" : ""}`} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                  {/* Custom Search Terms */}
                  <div>
                    <label className="block text-xs font-mono font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                      <Search className="h-3 w-3 text-emerald-400" /> Filtros de Gmail (Búsqueda)
                    </label>
                    <input
                      type="text"
                      placeholder="INTRANT OR Morrison OR Marranzini"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-900 border border-slate-800 focus:border-emerald-500  rounded px-3 py-2 text-white outline-none transition"
                    />
                  </div>

                  {/* Strict date validation option */}
                  <div className="flex items-center justify-between p-2.5 bg-slate-950/50 border border-slate-800/80 rounded-lg">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-slate-300">Exclusivo Día de Hoy</span>
                      <span className="text-[10px] text-slate-500">Filtrar con El Águila solo noticias de hoy</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyToday}
                        onChange={(e) => setOnlyToday(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                    </label>
                  </div>

                  {/* Test sheet connection button */}
                  <div className="pt-2 border-t border-slate-800/60">
                    <button
                      onClick={handleTestSheet}
                      disabled={sheetTesting || !user}
                      className="w-full text-xs py-2 px-3 text-slate-300 transition-colors bg-[#172236] border border-slate-800 hover:bg-[#1a2942] disabled:opacity-50 disabled:cursor-not-allowed rounded flex items-center justify-center gap-2"
                    >
                      {sheetTesting ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />
                          <span>Mapeando columnas...</span>
                        </>
                      ) : (
                        <>
                          <Database className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Probar Hoja y Mapear Columnas</span>
                        </>
                      )}
                    </button>

                    {sheetTestMessage && (
                      <div className={`mt-2 p-2.5 border rounded-lg text-[11px] leading-relaxed flex gap-2 ${
                        sheetTestMessage.success 
                          ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-300"
                          : "bg-rose-950/20 border-rose-900/50 text-rose-300"
                      }`}>
                        {sheetTestMessage.success ? (
                          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                        )}
                        <span>{sheetTestMessage.text}</span>
                      </div>
                    )}
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Execution Controls: Manual & automatic periodic */}
          <div className="border border-slate-800 bg-[#0c1322] p-5 rounded-xl shadow-md space-y-4">
            <h3 className="font-heading font-semibold text-white text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" /> Control del Escáner
            </h3>

            {geminiQuotaExceeded && (
              <motion.div 
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-amber-950/30 border border-amber-900/40 rounded-lg text-xs text-amber-200 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                  <span className="font-semibold text-amber-300">¿Sincronización Detenida?</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Has excedido el límite diario de 20 consultas gratuitas de la API de Gemini. 
                  Esto se soluciona fácilmente activando la facturación o la cuota pagada en AI Studio.
                </p>
                <div className="pt-1 text-[10px] text-amber-400 font-medium font-sans">
                  💡 Configura un plan de pago en <b>"Settings" &rarr; "Secrets"</b> en la barra superior.
                </div>
              </motion.div>
            )}

            {/* Run manual trigger */}
            <button
              onClick={() => {
                const cfg = getSyncButtonConfig();
                cfg.onClick();
              }}
              disabled={getSyncButtonConfig().disabled}
              className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-xs font-bold shadow-md transition-all uppercase tracking-wider font-sans ${getSyncButtonConfig().className}`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-white" />
                  <span>Procesando Correos de Hoy...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 text-white hover:scale-110 transition-transform" />
                  <span>{getSyncButtonConfig().text}</span>
                </>
              )}
            </button>

            {/* Auto Periodic Section */}
            <div className="pt-4 border-t border-slate-800/85">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">Vigilancia Periódica</span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={activeAutoMonitor}
                    disabled={!user || !spreadsheetId}
                    onChange={(e) => {
                      setActiveAutoMonitor(e.target.checked);
                      if (e.target.checked) {
                        setTimeLeft(checkInterval * 60);
                        addClientLog("info", `Activando vigilancia automática cada ${checkInterval} minutos.`);
                      } else {
                        addClientLog("info", "Vigilancia automática desactivada.");
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-400 after:border-slate-350 after:border after:rounded-full after:h-4 active:after:w-5 after:w-4 after:transition-all dark:border-gray-500 peer-checked:bg-emerald-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                </label>
              </div>

              {/* Interval customization */}
              <div className="grid grid-cols-3 gap-1.5 mb-3.5">
                {[15, 60, 240].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setCheckInterval(mins)}
                    disabled={activeAutoMonitor}
                    className={`text-[11px] font-mono py-1.5 border rounded transition-colors ${
                      checkInterval === mins
                        ? "bg-emerald-950/30 border-emerald-500/50 text-emerald-400 font-semibold"
                        : "bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400"
                    }`}
                  >
                    {mins === 15 ? "15 m" : mins === 60 ? "1 h" : "4 h"}
                  </button>
                ))}
              </div>

              {/* Status display when active */}
              {activeAutoMonitor && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Próximo chequeo en:</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold tracking-widest text-sm bg-slate-950/50 px-2 py-0.5 rounded border border-emerald-900/30">
                    {formatTime(timeLeft)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Native Browser Notifications Widget */}
          <div className="border border-slate-800 bg-[#0c1322] p-5 rounded-xl shadow-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-heading font-semibold text-white text-sm flex items-center gap-2">
                {isNotificationEnabled ? (
                  <Bell className="h-4 w-4 text-emerald-400 animate-swing" style={{ transformOrigin: "top center" }} />
                ) : (
                  <BellOff className="h-4 w-4 text-slate-400" />
                )}
                <span>Notificaciones de Escritorio</span>
              </h3>
              
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isNotificationEnabled && notificationPermission === "granted"}
                  onChange={(e) => handleToggleNotifications(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-400 after:border-slate-350 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
              </label>
            </div>

            <p className="text-xs text-slate-450 leading-relaxed">
              Recibe avisos visuales directos en tu computadora cada vez que El Águila procese e inserte una nueva noticia relevante de INTRANT en tu Google Sheet de destino.
            </p>

            <div className="space-y-3 pt-1">
              {/* Permission Status Line */}
              <div className="flex items-center justify-between text-xs bg-slate-950/40 border border-slate-850 p-2.5 rounded-lg">
                <span className="text-slate-400 font-medium">Estado del Permiso:</span>
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  {notificationPermission === "granted" ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-400 font-semibold uppercase">Permitido</span>
                    </>
                  ) : notificationPermission === "denied" ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      <span className="text-rose-400 font-semibold uppercase">Bloqueado</span>
                    </>
                  ) : (
                    <>
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-amber-400 font-semibold uppercase">No activo</span>
                    </>
                  )}
                </span>
              </div>

              {/* Action Buttons */}
              {notificationPermission !== "granted" ? (
                <button
                  onClick={requestNotificationPermission}
                  className="w-full bg-[#111c34] hover:bg-[#14223e] border border-slate-850 hover:border-slate-750 text-slate-200 text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium cursor-pointer"
                >
                  <Bell className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Habilitar Alertas de Navegador</span>
                </button>
              ) : (
                <button
                  onClick={testShowNotification}
                  disabled={!isNotificationEnabled}
                  className="w-full bg-[#111c34] hover:bg-[#14223e] border border-slate-800 hover:border-slate-700 text-slate-250 disabled:opacity-30 disabled:hover:bg-[#111c34] text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Enviar Alerta de Prueba 🦅</span>
                </button>
              )}

              {notificationPermission === "denied" && (
                <p className="text-[10px] text-rose-400 leading-normal bg-rose-950/20 border border-rose-900/25 p-2 rounded-lg text-center font-sans">
                  ⚠️ <b>Importante:</b> Has bloqueado las notificaciones. Para reactivarlas, pulsa el ícono de candado junto a la dirección URL de esta pestaña en tu navegador y selecciona "Permitir".
                </p>
              )}
            </div>
          </div>

          {/* COLLAPSIBLE DOCUMENTATION PANEL */}
          <div className="border border-slate-800 bg-[#0c1322] rounded-xl overflow-hidden shadow-md">
            <div 
              onClick={() => setShowDocPanel(!showDocPanel)}
              className="flex justify-between items-center px-4 py-3 bg-[#111929] cursor-pointer hover:bg-[#141f33] transition"
            >
              <div className="flex items-center gap-2 text-white">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                <span className="font-heading font-medium text-sm">Guía de Configuración</span>
              </div>
              {showDocPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            <AnimatePresence initial={false}>
              {showDocPanel && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-4 border-t border-slate-800 text-slate-300 text-xs space-y-3.5 leading-relaxed"
                >
                  <div>
                    <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1 text-xs">
                      <span className="bg-emerald-900/50 text-emerald-300 h-4 w-4 flex items-center justify-center rounded-full text-[10px]">1</span>
                      OAuth & Scopes en AI Studio
                    </h4>
                    <p className="text-slate-400 pl-5">
                      La applet ya ha recibido tu confirmación para acceder a Gmail en modo Lectura y para actualizar hojas creadas en tu cuenta.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1 text-xs">
                      <span className="bg-emerald-900/50 text-emerald-300 h-4 w-4 flex items-center justify-center rounded-full text-[10px]">2</span>
                      Compartir el Google Sheet
                    </h4>
                    <p className="text-slate-400 pl-5">
                      Si usas el mismo correo para conectar la applet y tu Google Sheet, no necesitas configurar permisos adicionales. El sistema escribirá libremente en la pestaña designada usando tus credenciales de Google Workspace.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1 text-xs">
                      <span className="bg-emerald-900/50 text-emerald-300 h-4 w-4 flex items-center justify-center rounded-full text-[10px]">3</span>
                      Nombres de las Columnas (Headers)
                    </h4>
                    <p className="text-slate-400 pl-5">
                      El Águila detecta tus columnas existentes. Si encuentra columnas con textos equivalentes ("Fecha", "Asunto", "Contenido", "Enlace"), insertará el valor en su respectiva columna sin importar el orden exacto.
                    </p>
                    <p className="text-slate-400 pl-5 mt-1">
                      Si tu hoja está en blanco, insertará automáticamente las 7 columnas predefinidas de prensa.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1 text-xs">
                      <span className="bg-amber-950/50 text-amber-300 h-4 w-4 flex items-center justify-center rounded-full text-[10px]">4</span>
                      Vigilancia sin Supervisión (Durable)
                    </h4>
                    <p className="text-slate-400 pl-5">
                      Los tokens de acceso de Google de 1 hora vencen por seguridad de la API. Si deseas que <b>El Águila trabaje sin supervisión</b> de fondo (vías intervalos de 15m, 1h, o 4h), puedes suministrar los siguientes Secrets opcionales en el panel de Configuración de la plataforma:
                    </p>
                    <ul className="list-disc text-slate-400 pl-9 mt-1 space-y-0.5">
                      <li><code className="text-amber-400">GOOGLE_CLIENT_ID</code></li>
                      <li><code className="text-amber-400">GOOGLE_CLIENT_SECRET</code></li>
                      <li><code className="text-amber-400">GOOGLE_REFRESH_TOKEN</code></li>
                    </ul>
                    <p className="text-slate-500 pl-5 mt-1">
                      Si estos valores están presentes, el servidor renovará el acceso automáticamente, eliminando alertas de vencimiento por completo y permitiendo un monitoreo infinito.
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-300 mb-0.5">Deduplicación Automática</p>
                    Cada alerta guardada incluye el ID de mensaje único de Gmail. El sistema inspecciona todas las filas previas antes de insertar, evitando cualquier riesgo de duplicado si ejecutas la vigilancia repetidamente.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* RIGHT COLUMN: Scanned Alerts Grid (Line reports) and Logger Terminal (8 grid steps) */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* SATELLITE TABS SWITCHER FOR WORKSPACE AREA */}
          <div className="flex bg-[#0a101d] border border-slate-800 p-1.5 rounded-xl gap-2 shadow-lg">
            <button
              onClick={() => setMainTab("vigilance")}
              className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-3 sm:px-4 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mainTab === "vigilance"
                  ? "bg-[#16253b] text-white border border-emerald-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/30 border border-transparent"
              }`}
            >
              <Activity className={`h-4.5 w-4.5 shrink-0 ${mainTab === "vigilance" ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
              <div className="text-left hidden sm:block leading-tight">
                <span className="block text-xs">Vigilancia en Vivo</span>
                <span className="block text-[9px] text-slate-450 font-normal">Scraping & Alertas</span>
              </div>
              <div className="sm:hidden text-center">Vigilancia</div>
              {scannedAlerts.length > 0 && (
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  {scannedAlerts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setMainTab("sheet-news");
                // Fetch latest sheet news when visiting the tab to keep it super fresh
                if (token && spreadsheetId && sheetName && sheetName !== "__custom__") {
                  fetchSheetNews(token);
                }
              }}
              className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-3 sm:px-4 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mainTab === "sheet-news"
                  ? "bg-[#16253b] text-white border border-emerald-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/30 border border-transparent"
              }`}
            >
              <Database className={`h-4.5 w-4.5 shrink-0 ${mainTab === "sheet-news" ? "text-emerald-400" : "text-slate-400"}`} />
              <div className="text-left hidden sm:block leading-tight">
                <span className="block text-xs">Registro de Prensa</span>
                <span className="block text-[9px] text-slate-450 font-normal">Hoja de Cálculo</span>
              </div>
              <div className="sm:hidden text-center">Registro</div>
              {sheetNews.length > 0 && (
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-900/35 font-mono text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  {sheetNews.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setMainTab("chatbot")}
              className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-3 sm:px-4 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mainTab === "chatbot"
                  ? "bg-[#16253b] text-white border border-emerald-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/30 border border-transparent"
              }`}
            >
              <Bot className={`h-4.5 w-4.5 shrink-0 ${mainTab === "chatbot" ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
              <div className="text-left hidden sm:block leading-tight">
                <span className="block text-xs">Asistente IA</span>
                <span className="block text-[9px] text-slate-450 font-normal">Chatbot El Águila</span>
              </div>
              <div className="sm:hidden text-center">Asistente IA</div>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          </div>

          {mainTab === "vigilance" && (
            <>
              {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#0c1322] border border-slate-850 p-4 rounded-xl shadow-md">
            
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-855">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Alertas Evaluadas</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-bold text-2xl text-white">{scannedAlerts.length}</span>
                <span className="text-xs text-slate-400">mensajes</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-855">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Registradas Éxito</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-bold text-2xl text-emerald-400">
                  {scannedAlerts.filter(a => a.status === "success").length}
                </span>
                <span className="text-[10px] text-emerald-500/80 bg-emerald-950/30 font-semibold px-1 rounded">NUEVAS</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-855">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Duplicadas Omitidas</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-bold text-2xl text-amber-500">
                  {scannedAlerts.filter(a => a.status === "duplicate").length}
                </span>
                <span className="text-xs text-slate-400">omitidas</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-855">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Omitidas Fecha / Relev.</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-bold text-2xl text-slate-400">
                  {scannedAlerts.filter(a => a.status === "pending").length}
                </span>
                <span className="text-xs text-slate-400">filtradas</span>
              </div>
            </div>

          </div>

          {/* Scan Results Panel */}
          <div className="border border-slate-800 bg-[#0c1322] rounded-xl overflow-hidden shadow-lg flex-1 min-h-[400px] flex flex-col">
            <div className="px-5 py-4 bg-[#111929] border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2.5">
                <Mail className="h-5 w-5 text-emerald-400" />
                <div>
                  <h2 className="font-heading font-bold text-white text-base">Alertas Identificadas ({systemDate})</h2>
                  <p className="text-xs text-slate-400">Resultados del análisis y registro en Google Sheets</p>
                </div>
              </div>

              {scannedAlerts.length > 0 && (
                <button
                  onClick={() => setScannedAlerts([])}
                  className="text-xs text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 hover:bg-rose-950/20 px-2 py-1 rounded transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpiar Cuadros
                </button>
              )}
            </div>

            {/* List body */}
            <div className="flex-1 overflow-y-auto p-5 max-h-[600px]">
              {scannedAlerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                  <div className="p-4 bg-slate-950/45 border border-slate-850/50 rounded-full mb-3 text-slate-400">
                    <Eye className="h-10 w-10 text-slate-650" />
                  </div>
                  <h3 className="font-heading font-semibold text-slate-400 text-sm">Sin alertas cargadas</h3>
                  <p className="text-xs max-w-sm mt-1 text-slate-500">
                    Presiona el botón de sincronización para buscar en tu buzón de Gmail correos de hoy sobre el INTRANT o Milton Morrison.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* CUADRO DE TRANSMISIÓN EXPLICATIVO (GOOGLE SHEETS DISCOVERY SCREEN) */}
                  <div className="border border-slate-800 bg-[#070d19] rounded-xl overflow-hidden shadow-inner">
                    <div className="px-4 py-3 bg-[#0a1224] border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <span className="text-xs font-heading font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                        Cuadro de Inserciones Realizadas en tu Google Sheet
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                        {scannedAlerts.length} noticias procesadas hoy
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950/70 border-b border-slate-850 text-slate-400 font-mono text-[10px] uppercase tracking-wide">
                            <th className="py-3 px-4 font-semibold">Noticia Encontrada en Gmail</th>
                            <th className="py-3 px-4 font-semibold">Remitente</th>
                            <th className="py-3 px-4 font-semibold text-center">Estado de Operación</th>
                            <th className="py-3 px-4 font-semibold text-center">Fila Destino</th>
                            <th className="py-3 px-4 font-semibold text-center">Enlaces / Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/60">
                          {scannedAlerts.map((alert) => {
                            const isSuccess = alert.status === "success";
                            const isDuplicate = alert.status === "duplicate";
                            const isError = alert.status === "error";

                            return (
                              <tr key={`res-${alert.id}`} className="hover:bg-slate-900/40 transition-colors">
                                <td className="py-3.5 px-4 max-w-[280px]">
                                  <div className="font-semibold text-white truncate" title={alert.subject}>
                                    {alert.subject}
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-1">
                                    <span className="bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800 text-[9px] font-mono">
                                      {alert.originalDate}
                                    </span>
                                    {alert.sentiment && (
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                                        alert.sentiment === 'Positivo' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40' :
                                        alert.sentiment === 'Negativo' ? 'bg-rose-950/40 text-rose-350 border-rose-900/40' :
                                        'bg-slate-900 text-slate-400 border-slate-800'
                                      }`}>
                                        {alert.sentiment}
                                      </span>
                                    )}
                                    {alert.id && (
                                      <span className="text-slate-500 font-mono text-[9px]">
                                        ID Correo: {alert.id.substring(0, 10)}...
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-slate-350 max-w-[150px] truncate" title={alert.sender}>
                                  {alert.sender || "N/A"}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {isSuccess ? (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-0.5 rounded-full select-none">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                      Guardado Nuevo ✅
                                    </span>
                                  ) : isDuplicate ? (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 bg-amber-950/30 border border-amber-900/40 px-2.5 py-0.5 rounded-full select-none">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                                      Ya Existía ⚠️
                                    </span>
                                  ) : isError ? (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-450 bg-rose-950/40 border border-rose-900/40 px-2.5 py-0.5 rounded-full select-none">
                                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                                      Error de Ingesta ❌
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full select-none">
                                      Omitido / No de Hoy
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {alert.rowNumber ? (
                                    <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2.5 py-1 rounded select-all shadow-sm ${
                                      isSuccess 
                                        ? "bg-emerald-950/90 text-emerald-400 border border-emerald-900/60" 
                                        : "bg-amber-950/50 text-amber-500 border border-amber-900/40"
                                    }`}>
                                      Fila #{alert.rowNumber}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 font-mono text-[11px] italic">Por filtrar / Omitido</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button 
                                      onClick={() => setSelectedAlert(selectedAlert === alert.id ? null : alert.id || "")}
                                      className="p-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                                      title={selectedAlert === alert.id ? "Contraer detalles" : "Expandir detalles"}
                                    >
                                      {selectedAlert === alert.id ? (
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    {alert.newsUrl && (
                                      <a
                                        href={alert.newsUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        referrerPolicy="no-referrer"
                                        className="p-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-900 rounded text-emerald-400 hover:text-emerald-300 transition"
                                        title="Visitar enlace origen"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SUBTITLE DIVIDER */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      Detalle Completo de Alertas Scrapeadas & Ensayos Gemini
                    </span>
                    <span className="flex-1 h-[1px] bg-slate-850" />
                  </div>

                  {/* Individual details blocks */}
                  <div className="space-y-4">
                    {scannedAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`border rounded-xl transition ${
                          selectedAlert === alert.id 
                            ? "bg-[#111827]/70 border-emerald-500/40" 
                            : "bg-slate-950/30 border-[#1e293b]/70 hover:border-slate-750"
                        }`}
                      >
                        {/* Entry header */}
                        <div
                          onClick={() => setSelectedAlert(selectedAlert === alert.id ? null : alert.id || "")}
                          className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer select-none"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                alert.status === "success" 
                                  ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900/30"
                                  : alert.status === "duplicate"
                                  ? "bg-amber-950/50 text-amber-500 border border-amber-900/30"
                                  : alert.status === "error"
                                  ? "bg-rose-950/50 text-rose-450 border border-rose-900/30"
                                  : "bg-slate-900 text-slate-400 border border-slate-800"
                              }`}>
                                {alert.statusDetails?.toUpperCase() || alert.status.toUpperCase()}
                              </span>
                              
                              {alert.rowNumber && (
                                <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded flex items-center gap-1 select-none shrink-0">
                                  <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                                  Fila #{alert.rowNumber}
                                </span>
                              )}

                              <span className="text-[10px] font-sans text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                {alert.originalDate}
                              </span>
                              {alert.sender && (
                                <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                                  De: {alert.sender}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-semibold text-white tracking-tight line-clamp-1">
                              {alert.subject}
                            </h4>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500 self-end sm:self-center">
                            <span className="text-[10px] font-mono bg-slate-900 px-1.5 py-0.5 rounded">ID: {alert.id?.substring(0, 8)}...</span>
                            {selectedAlert === alert.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                          </div>
                        </div>

                        {/* Expand details info */}
                        {selectedAlert === alert.id && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-850/60 font-sans text-xs space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <span className="text-[10px] font-mono font-medium text-slate-500 uppercase block mb-1">Asunto Simplificado / Titular</span>
                                <p className="text-slate-300 leading-relaxed font-semibold">{alert.subject}</p>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono font-medium text-slate-500 uppercase block mb-1">Remitente / Fuente</span>
                                <p className="text-slate-300 leading-relaxed">{alert.sender}</p>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono font-medium text-slate-500 uppercase block mb-1">Sentimiento Evaluado</span>
                                <div className="mt-1">
                                  {alert.sentiment ? (
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded border ${
                                      alert.sentiment === 'Positivo' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40' :
                                      alert.sentiment === 'Negativo' ? 'bg-rose-950/40 text-rose-350 border-rose-900/40' :
                                      'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${
                                        alert.sentiment === 'Positivo' ? 'bg-emerald-400 animate-pulse' :
                                        alert.sentiment === 'Negativo' ? 'bg-rose-500 animate-pulse' :
                                        'bg-slate-400'
                                      }`}></span>
                                      {alert.sentiment}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 italic">No disponible</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div>
                              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase block mb-1">Contenido / Resumen de Alerta</span>
                              <div className="p-3 bg-slate-900/80 border border-slate-850 rounded-lg text-slate-300 leading-relaxed max-h-[150px] overflow-y-auto">
                                {alert.content}
                              </div>
                            </div>

                            {alert.newsUrl && (
                              <div className="p-2.5 bg-[#101b2e]/60 border border-blue-950/40 rounded-lg flex items-center justify-between gap-3 text-slate-300">
                                <div className="flex items-center gap-2 truncate">
                                  <ExternalLink className="h-4 w-4 text-emerald-400 shrink-0" />
                                  <span className="font-semibold text-emerald-400 text-[11px] shrink-0">Enlace Noticia:</span>
                                  <span className="font-mono text-[10px] truncate">{alert.newsUrl}</span>
                                </div>
                                <a
                                  href={alert.newsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  referrerPolicy="no-referrer"
                                  className="text-[10px] font-semibold bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded border border-emerald-900/30 transition shadow shrink-0 flex items-center gap-1"
                                >
                                  <span>Ver</span>
                                  <ArrowRight className="h-3 w-3" />
                                </a>
                              </div>
                            )}

                            {alert.otherData && (
                              <div>
                                <span className="text-[10px] font-mono font-medium text-slate-500 uppercase block mb-1">Otros Datos Extraídos</span>
                                <p className="text-slate-400 leading-relaxed bg-[#1b1c20]/20 p-2 border border-slate-800/50 rounded font-sans text-[11px] italic">
                                  {alert.otherData}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          </>)}

          {mainTab === "sheet-news" && (
            <>
              {/* USER SPREADSHEET NEWS WIDGET */}
          <div className="border border-slate-800 bg-[#0c1322] rounded-xl overflow-hidden shadow-lg flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 bg-[#111929] border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-950/40 text-emerald-400 border border-emerald-800/50 rounded-lg animate-pulse">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-heading font-bold text-white text-base">Noticias en el Registro de Prensa</h2>
                  <p className="text-xs text-slate-400">Noticias insertadas en Google Sheets por fila</p>
                </div>
              </div>

              {token && spreadsheetId && sheetName && sheetName !== "__custom__" && (
                <button
                  onClick={() => fetchSheetNews(token)}
                  disabled={isFetchingSheetNews}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1.5 hover:bg-[#142338] border border-emerald-900/40 px-3 py-1.5 rounded-lg transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetchingSheetNews ? "animate-spin" : ""}`} />
                  <span>Actualizar Hoja</span>
                </button>
              )}
            </div>

            {/* Subheader Filters */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-800/70 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar noticia en la hoja por título, contenido o número de fila..."
                  value={sheetNewsSearch}
                  onChange={(e) => setSheetNewsSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800/80 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none placeholder-slate-500 transition-colors"
                />
                {sheetNewsSearch && (
                  <button
                    onClick={() => setSheetNewsSearch("")}
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/50 px-3 py-1.5 border border-slate-800 rounded-lg whitespace-nowrap">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>Pestaña: </span>
                <span className="text-emerald-400 font-bold truncate max-w-[100px]" title={sheetName}>
                  {sheetName || "No config."}
                </span>
              </div>
            </div>

            {/* List Body */}
            <div className="overflow-y-auto p-4 max-h-[420px] bg-[#090f1d]/40 space-y-3.5">
              {!token ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
                  <ShieldAlert className="h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-xs max-w-xs leading-normal">
                    Conecta tu cuenta de Google Workspace para visualizar las noticias guardadas en el Google Sheet.
                  </p>
                </div>
              ) : !spreadsheetId.trim() || sheetName === "__custom__" || !sheetName.trim() ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
                  <Settings className="h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-xs max-w-xs leading-normal">
                    Configura un ID de Google Sheet y pestaña de destino válidos para examinar las noticias del documento.
                  </p>
                </div>
              ) : isFetchingSheetNews && sheetNews.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center text-slate-500">
                  <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
                  <p className="text-xs">Rastreando filas y buscando noticias de {sheetName}...</p>
                </div>
              ) : sheetNewsError ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
                  <AlertTriangle className="h-8 w-8 text-amber-500/80 mb-2" />
                  <p className="text-xs text-amber-500 font-semibold mb-1">No se pudo acceder al Sheet</p>
                  <p className="text-[11px] max-w-xs text-slate-400 mb-3">{sheetNewsError}</p>
                  <button
                    onClick={() => { if (token) fetchSheetNews(token); }}
                    type="button"
                    className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 px-3 py-1.5 rounded transition"
                  >
                    Reintentar Conexión
                  </button>
                </div>
              ) : (() => {
                const query = sheetNewsSearch.trim().toLowerCase();
                const filtered = sheetNews.filter((item) => {
                  if (!query) return true;
                  return (
                    item.subject.toLowerCase().includes(query) ||
                    item.content.toLowerCase().includes(query) ||
                    String(item.rowNumber).includes(query) ||
                    item.date.toLowerCase().includes(query) ||
                    item.sender.toLowerCase().includes(query)
                  );
                });

                // Display Google Sheets news descending (final row first)
                const sortedDescending = [...filtered].sort((a, b) => b.rowNumber - a.rowNumber);

                if (sortedDescending.length === 0) {
                  return (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
                      <Search className="h-8 w-8 text-slate-700 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">Ninguna coincidencia</p>
                      <p className="text-[11px] text-slate-550 mt-1">
                        Intenta otra búsqueda o limpia el filtro para ver las {sheetNews.length} noticias.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {sortedDescending.map((item) => (
                      <div
                        key={item.rowNumber}
                        className="bg-[#111929]/50 hover:bg-[#131d30]/75 border border-slate-800/60 p-3 rounded-lg transition-colors flex flex-col sm:flex-row justify-between items-start gap-3"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Sheet Row Number Highlight */}
                            <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded flex items-center gap-1 shrink-0 select-none">
                              <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full"></span>
                              Fila #{item.rowNumber}
                            </span>
                            {item.date && (
                              <span className="text-[9px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-850">
                                {item.date}
                              </span>
                            )}
                            {item.sender && (
                              <span className="text-[9px] font-mono text-slate-500 truncate max-w-[150px]">
                                De: {item.sender}
                              </span>
                            )}
                          </div>
                          
                          <h4 className="text-xs font-bold text-white tracking-tight leading-snug">
                            {item.subject}
                          </h4>

                          {item.content && (
                            <p className="text-[11px] text-slate-300 leading-relaxed font-sans line-clamp-2">
                              {item.content}
                            </p>
                          )}
                        </div>

                        {item.newsUrl && (
                          <a
                            href={item.newsUrl}
                            target="_blank"
                            rel="noreferrer"
                            referrerPolicy="no-referrer"
                            className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition flex items-center gap-1 self-end sm:self-center shrink-0"
                          >
                            <span>Ir al origen</span>
                            <ArrowRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Footer Summary */}
            {sheetNews.length > 0 && (
              <div className="px-4 py-2 bg-[#111c34] border-t border-slate-800 text-[10px] font-mono text-slate-400 flex justify-between items-center shrink-0">
                <span>Total en pestaña: <b>{sheetNews.length} noticias</b></span>
                <span>Última fila ocupada: <b>#{sheetNews[sheetNews.length - 1]?.rowNumber || ""}</b></span>
              </div>
            )}
          </div>
          </>)}

          {mainTab === "vigilance" && (
            <>
              {/* System Logs console */}
              <div className="border border-slate-850 bg-[#050810] p-4 rounded-xl shadow-lg flex flex-col font-mono h-[280px]">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-850 mb-3 text-xs text-slate-400 shrink-0">
              <span className="flex items-center gap-2 text-white font-semibold">
                <Terminal className="h-4 w-4 text-emerald-400" /> Terminal de Vigilancia "El Águila"
              </span>
              <button
                onClick={handleClearLogs}
                className="text-[10px] font-mono hover:text-slate-200 bg-slate-900 hover:bg-slate-850 px-2.5 py-1 border border-slate-800 rounded transition"
              >
                Limpiar Consola
              </button>
            </div>

            <div className="flex-1 overflow-y-auto text-xs leading-relaxed space-y-1.5 pr-2 scrolling-terminal">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-2.5 items-start">
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}
                  </span>
                  <span className={`shrink-0 font-semibold uppercase text-[9px] px-1 py-0.2 rounded select-none ${
                    log.type === "success"
                      ? "text-emerald-400 bg-emerald-950/20"
                      : log.type === "error"
                      ? "text-rose-400 bg-rose-950/20"
                      : log.type === "warn"
                      ? "text-amber-500 bg-amber-950/20"
                      : "text-blue-400 bg-blue-950/20"
                  }`}>
                    {log.type}
                  </span>
                  <span className={
                    log.type === "success"
                      ? "text-slate-300"
                      : log.type === "error"
                      ? "text-rose-300 font-semibold"
                      : log.type === "warn"
                      ? "text-amber-200/90"
                      : "text-slate-400"
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
          </>)}

          {/* CHATBOT FULL TAB VIEW */}
          {mainTab === "chatbot" && (
            <div className="border border-slate-800 bg-[#0c1322] rounded-xl overflow-hidden shadow-lg flex flex-col h-[580px]">
              {/* Header */}
              <div className="px-5 py-4 bg-[#111929] border-b border-slate-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-950 text-emerald-400 border border-emerald-900/30 flex items-center justify-center rounded-lg shadow-inner">
                    <Bot className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-white text-base">Asistente Inteligente El Águila</h2>
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      Operador IA del Águila Digital Online
                    </p>
                  </div>
                </div>
                
                <div className="text-[10px] text-slate-500 font-mono bg-slate-950/50 px-2.5 py-1 rounded border border-slate-850">
                  Modelo: Gemini 3.5 Flash (Oficial)
                </div>
              </div>

              {/* Chat messages viewport */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#080d17] select-text">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-450">
                    <div className="p-4 bg-[#111929] border border-slate-805 rounded-full mb-3 text-emerald-400">
                      <Bot className="h-8 w-8 text-emerald-405" />
                    </div>
                    <p className="text-xs max-w-sm text-slate-400 leading-relaxed">
                      ¡Hola! Soy <b>"El Águila Digital"</b>, tu asistente de prensa. Pregúntame sobre el proceso de sincronización, cómo agregar el Token de Google manualmente, o los estados de guardado.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-3.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${
                        msg.role === "user"
                          ? "bg-slate-800 text-slate-300 border border-slate-700"
                          : "bg-emerald-950 text-emerald-400 border border-emerald-900/30"
                      }`}>
                        {msg.role === "user" ? (
                          <UserIcon className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                        msg.role === "user"
                          ? "bg-emerald-600 text-white rounded-tr-none"
                          : "bg-[#142036] border border-slate-800/80 text-slate-200 rounded-tl-none"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <span className="text-[9px] text-slate-550 font-mono block text-right mt-1.5">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                
                {isChatTyping && (
                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-900/30 shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-[#142036] border border-slate-800/80 text-slate-400 rounded-2xl rounded-tl-none px-4 py-3.5 text-xs flex items-center gap-1.5 shadow-sm">
                      <span className="h-1 w-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="h-1 w-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="h-1 w-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Suggestions Chips */}
              <div className="px-4 py-2.5 bg-[#090f1a] border-t border-slate-850 flex flex-wrap gap-2 shrink-0">
                <span className="text-[9px] font-mono text-slate-505 flex items-center gap-1 py-1 mr-1">
                  Sugerencias:
                </span>
                {[
                  "¿Cómo activar la vigilancia?",
                  "¿Donde copio el ID del Google Sheet?",
                  "¿Cómo usar Token de Google OAuth Playground?",
                  "¿El sistema evita noticias repetidas?"
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setChatInput(suggestion);
                    }}
                    className="text-[10px] bg-slate-900 hover:bg-[#111c30] text-slate-350 hover:text-emerald-355 border border-slate-800 hover:border-emerald-900/40 px-3 py-1 rounded-full transition-all cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {/* Chat input box */}
              <form onSubmit={handleSendChatMessage} className="p-4 bg-[#111929] border-t border-slate-800 flex gap-3 shrink-0">
                <input
                  type="text"
                  placeholder="Envía un consulta al Águila Digital sobre alertas o sincronización..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs text-white outline-none placeholder-slate-500 transition-all shadow-inner focus:ring-1 focus:ring-emerald-900/30"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatTyping}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 font-heading text-xs font-bold text-white rounded-xl transition-all shadow shrink-0 flex items-center justify-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </form>
            </div>
          )}

        </div>

      </main>

      {/* FLOATING CHATBOT "EL ÁGUILA" */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[380px] h-[520px] max-w-[calc(100vw-2rem)] bg-[#0d1527] border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4"
            >
              {/* Header */}
              <div className="p-4 bg-[#111c34] border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-emerald-950 text-emerald-400 rounded-lg">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide uppercase font-heading">
                      El Águila Digital
                    </h4>
                    <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Vigilante Automático Activo
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-1 text-slate-450 hover:text-white rounded-lg transition-colors hover:bg-slate-850"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Message log */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#090f1d] shrink-0">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      msg.role === "user"
                        ? "bg-slate-800 text-slate-300"
                        : "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30"
                    }`}>
                      {msg.role === "user" ? (
                        <UserIcon className="h-3.5 w-3.5" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-tr-none"
                        : "bg-[#141d34] border border-slate-800/60 text-slate-200 rounded-tl-none"
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                      <span className="text-[8px] text-slate-500 font-mono block text-right mt-1.5">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                {isChatTyping && (
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 shrink-0 animate-pulse">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="bg-[#141d34] border border-slate-800/60 text-slate-450 rounded-xl rounded-tl-none px-3.5 py-3 text-xs flex items-center gap-1">
                      <span className="h-1 w-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="h-1 w-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="h-1 w-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Footer Input */}
              <form onSubmit={handleSendChatMessage} className="p-3 bg-[#111c34] border-t border-slate-800 flex gap-2">
                <input
                  type="text"
                  placeholder="Escribe tu consulta sobre El Águila..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none placeholder-slate-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatTyping}
                  className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl transition-colors flex items-center justify-center shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`h-12 w-12 rounded-full flex items-center justify-center shadow-2xl border transition-all duration-300 ${
            isChatOpen
              ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-750"
              : "bg-emerald-600 hover:bg-emerald-500 border-emerald-500/30 text-white"
          }`}
          title="Abrir Chat de Soporte El Águila"
        >
          {isChatOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <div className="relative">
              <MessageSquare className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-emerald-400 border-2 border-emerald-600 rounded-full animate-ping"></span>
            </div>
          )}
        </motion.button>
      </div>

    </div>
  );
}
