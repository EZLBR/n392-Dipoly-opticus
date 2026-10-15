import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { ANONYMOUS_STUDIO_OWNER, STUDIO_OWNER_KEY, mergeSavedDesigns, readJSON, switchStudioOwner } from "../eyewear/storage";
import { apiClient, ProblemError, setAuthErrorHandler } from "../api/client";

// O token vai explícito quando a resposta precisa ser conferida contra a
// sessão que fez a requisição (BUG #82): se a sessão mudar no meio do
// caminho, a resposta antiga é descartada.
const comToken = (token?: string | null) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
const mensagemDoProblema = (erro: unknown) =>
  erro instanceof ProblemError ? erro.detail || erro.title || erro.message : undefined;

const AuthContext = createContext<any>(undefined);

export function AuthProvider({ children }) {
  const [designs, setDesigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [authWarning, setAuthWarning] = useState<string | null>(null);
  const [studioOwner, setStudioOwner] = useState<string | undefined>();
  const ownerRef = useRef<string | undefined>(undefined);
  const authTokenRef = useRef<string | null>(null);
  const [studioSessionChanged, setStudioSessionChanged] = useState(false);
  const isCurrentStudioSession = () => ownerRef.current === localStorage.getItem(STUDIO_OWNER_KEY)
    && authTokenRef.current === localStorage.getItem("opticus_token");
  const invalidateLocalSession = () => {
    ownerRef.current = undefined;
    authTokenRef.current = null;
    setStudioOwner(undefined);
    setStudioSessionChanged(true);
    setSession(null); setDesigns([]); setUsers([]);
  };

  const changeStudioOwner = (owner: string) => {
    switchStudioOwner(localStorage, owner);
    ownerRef.current = owner;
    setStudioOwner(owner);
    setDesigns(readJSON(localStorage, "opticus_designs", []));
  };
  const endSession = () => {
    if (ownerRef.current && ownerRef.current !== localStorage.getItem(STUDIO_OWNER_KEY)) {
      invalidateLocalSession(); return;
    }
    localStorage.removeItem("opticus_token");
    authTokenRef.current = null;
    setStudioSessionChanged(false);
    changeStudioOwner(ANONYMOUS_STUDIO_OWNER);
    setSession(null);
    setUsers([]);
  };
  const startSession = (user, token: string) => {
    changeStudioOwner("user:" + String(user.publicId ?? user.id));
    authTokenRef.current = token;
    setStudioSessionChanged(false);
    localStorage.setItem("opticus_token", token);
    setSession(user);
    setIsBackendConnected(true);
    fetchBackendDesigns(token);
  };

  const clearAuthWarning = () => setAuthWarning(null);

  useEffect(() => {
    setAuthErrorHandler((status, problem) => {
      const message = problem?.title || (status === 401 ? "Acesso não autorizado." : "Acesso negado.");
      if (status === 401) {
        endSession();
      } else if (status === 403) {
        setAuthWarning(message);
      }
    });

    return () => {
      setAuthErrorHandler(null);
    };
  }, []);

  const fetchBackendUsers = async (token?: string) => {
    try {
      const data = await apiClient.get<any>("/auth/users", comToken(token));
      if (token === localStorage.getItem("opticus_token")) {
        setUsers(data.users || data);
      }
    } catch (e) {
      console.error("Failed to load backend users:", e);
    }
  };

  const fetchBackendDesigns = async (token?: string) => {
    const owner = ownerRef.current;
    if (owner !== localStorage.getItem(STUDIO_OWNER_KEY) || token !== localStorage.getItem("opticus_token")) return;
    try {
      const data = await apiClient.get<any>("/designs", comToken(token));
      if (owner === ownerRef.current && isCurrentStudioSession() && token === authTokenRef.current) {
        const merged = mergeSavedDesigns(data.designs || data, readJSON(localStorage, "opticus_designs", []));
        setDesigns(merged);
        localStorage.setItem("opticus_designs", JSON.stringify(merged));
      }
    } catch (e) {
      console.error("Failed to load backend designs:", e);
    }
  };

  useEffect(() => {
    async function initSession() {
      const token = localStorage.getItem("opticus_token");
      authTokenRef.current = token;
      if (token) {
        try {
          const data = await apiClient.get<any>("/auth/me", comToken(token));
          if (localStorage.getItem("opticus_token") !== token) return;
          startSession(data.user || data, token);
          fetchBackendUsers(token);
          return;
        } catch (e) {
          console.error("Não foi possível validar a sessão no backend:", e);
        }
        if (localStorage.getItem("opticus_token") !== token) return;
        endSession();
      }
      changeStudioOwner(ANONYMOUS_STUDIO_OWNER);
    }

    initSession();
  }, []);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if ((!event.key || event.key === STUDIO_OWNER_KEY || event.key === "opticus_token") && !isCurrentStudioSession()) {
        invalidateLocalSession();
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const login = async (email, password) => {
    try {
      const data = await apiClient.post<any>("/auth/login", { email, password });
      const userData = data.user || data;
      startSession(userData, data.token);
      return { ok: true, role: userData.role };
    } catch (err) {
      console.error("Falha ao acessar o backend durante o login:", err);
      if (err instanceof ProblemError) {
        return { ok: false, message: mensagemDoProblema(err) || "Login failed." };
      }
      setIsBackendConnected(false);
      return { ok: false, message: "Serviço de autenticação indisponível. Tente novamente." };
    }
  };

  const signup = async ({ name, email, password }) => {
    try {
      const data = await apiClient.post<any>("/auth/register", { name, email, password });
      const userData = data.user || data;
      startSession(userData, data.token);
      return { ok: true, role: userData.role };
    } catch (err) {
      console.error("Falha ao acessar o backend durante o cadastro:", err);
      if (err instanceof ProblemError) {
        return { ok: false, message: mensagemDoProblema(err) || "Signup failed." };
      }
      setIsBackendConnected(false);
      return { ok: false, message: "Serviço de cadastro indisponível. Tente novamente." };
    }
  };

  const logout = endSession;

  const saveDesign = async (designData) => {
    const token = authTokenRef.current;
    const owner = ownerRef.current;
    if (!owner) throw new Error("Aguarde o carregamento da sessão.");
    if (!isCurrentStudioSession()) {
      invalidateLocalSession();
      throw new Error("A sessão mudou em outra aba. Atualize a página antes de salvar.");
    }
    let finalId = designData.id || `design-${Date.now()}`;
    let syncStatus = "local";
    if (isBackendConnected && token) {
      try {
        const data = await apiClient.post<any>("/designs", { ...designData, id: finalId }, comToken(token));
        finalId = data.id || data.design?.id || finalId;
        syncStatus = "synced";
      } catch (e) {
        console.error("Backend design save failed, shifting to local cache:", e);
      }
    }

    if (owner !== ownerRef.current || token !== authTokenRef.current || !isCurrentStudioSession()) {
      throw new Error("A sessão mudou durante o salvamento. Abra o Studio novamente.");
    }
    const cached = readJSON(localStorage, "opticus_designs", []);
    const existingIndex = cached.findIndex(item => String(item.id) === String(finalId));
    const previousDesign = existingIndex >= 0 ? cached[existingIndex] : {};
    const newDesign = {
      ...previousDesign,
      ...designData,
      id: finalId,
      syncStatus,
      createdAt: previousDesign.createdAt || previousDesign.created_at || designData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedDesigns = existingIndex >= 0 ? cached.map((item, i) => i === existingIndex ? newDesign : item) : [...cached, newDesign];
    localStorage.setItem("opticus_designs", JSON.stringify(updatedDesigns));
    localStorage.setItem("opticus_active_design", String(existingIndex >= 0 ? existingIndex : updatedDesigns.length - 1));
    localStorage.setItem("opticus_active_design_id", String(finalId));
    setDesigns(updatedDesigns);
    return newDesign;
  };

  const deleteBackendDesign = async (designId) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await apiClient.delete(`/designs/${designId}`, comToken(token));
        fetchBackendDesigns(token);
      } catch (e) {
        console.error("Failed to delete backend design:", e);
      }
    }
  };

  const updateUser = async (userId, dataToUpdate) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await apiClient.put(`/auth/users/${userId}`, dataToUpdate, comToken(token));
        fetchBackendUsers(token);
        return { ok: true };
      } catch (e) {
        console.error("User update failed:", e);
        if (e instanceof ProblemError) return { ok: false, message: mensagemDoProblema(e) };
      }
    }

    return { ok: false, message: "Serviço de usuários indisponível." };
  };

  const deleteUser = async (userId) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await apiClient.delete(`/auth/users/${userId}`, comToken(token));
        fetchBackendUsers(token);
        return { ok: true };
      } catch (e) {
        console.error("User deletion failed:", e);
        if (e instanceof ProblemError) return { ok: false, message: mensagemDoProblema(e) };
      }
    }

    return { ok: false, message: "Serviço de usuários indisponível." };
  };

  return (
    <AuthContext.Provider value={{
      session,
      studioOwner,
      studioSessionChanged,
      setSession,
      users,
      designs,
      isBackendConnected,
      authWarning,
      clearAuthWarning,
      setAuthWarning,
      login,
      signup,
      logout,
      saveDesign,
      deleteBackendDesign,
      updateUser,
      deleteUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
