import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { ANONYMOUS_STUDIO_OWNER, STUDIO_OWNER_KEY, mergeSavedDesigns, readJSON, switchStudioOwner } from "../eyewear/storage";
import { apiClient, ProblemError, setAuthErrorHandler } from "../api/client";
import { googleErrorKey } from "../api/googleSignIn";
import { localizeProblem, translate } from "./LanguageContext";
import type { AuthResult, DesignFields, SavedDesign, SignUpInput, User } from "../types/domain";

type SessionResponse = { user: User; token: string } | (User & { token: string });
type UpdateUser = Pick<SignUpInput, "name"> & { factoryName?: string | null };
type UserMutation = { ok: true } | { ok: false; message?: string };

interface AuthContextValue {
  session: User | null;
  sessionLoading: boolean;
  sessionToken: string | null;
  studioOwner: string | undefined;
  studioSessionChanged: boolean;
  setSession: React.Dispatch<React.SetStateAction<User | null>>;
  users: User[];
  designs: SavedDesign[];
  isBackendConnected: boolean;
  authWarning: string | null;
  clearAuthWarning: () => void;
  setAuthWarning: React.Dispatch<React.SetStateAction<string | null>>;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (input: SignUpInput) => Promise<AuthResult>;
  loginWithGoogle: (input: { code: string; verifier: string; nonce: string }) => Promise<AuthResult>;
  logout: () => void;
  saveDesign: (design: DesignFields & { id?: string | null }) => Promise<SavedDesign>;
  deleteDesign: (designId: string) => Promise<void>;
  deleteBackendDesign: (designId: string) => Promise<void>;
  updateUser: (userId: string, input: UpdateUser) => Promise<UserMutation>;
  deleteUser: (userId: string) => Promise<UserMutation>;
}

// O token vai explícito quando a resposta precisa ser conferida contra a
// sessão que fez a requisição (BUG #82): se a sessão mudar no meio do
// caminho, a resposta antiga é descartada.
const comToken = (token?: string | null) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
const mensagemDoProblema = (erro: unknown) =>
  erro instanceof ProblemError ? localizeProblem(erro.problem) : undefined;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [session, setSession] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
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
    setDesigns(readJSON<SavedDesign[]>(localStorage, "opticus_designs", []));
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
  const startSession = (user: User, token: string) => {
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
      if (status === 401) {
        endSession();
      } else if (status === 403) {
        setAuthWarning(localizeProblem(problem ?? { status }));
      }
    });

    return () => {
      setAuthErrorHandler(null);
    };
  }, []);

  const fetchBackendUsers = async (token?: string) => {
    try {
      const data = await apiClient.get<{ users: User[] } | User[]>("/auth/users", comToken(token));
      if (token === localStorage.getItem("opticus_token")) {
        setUsers(Array.isArray(data) ? data : data.users);
      }
    } catch (e) {
      console.error("Failed to load backend users:", e);
    }
  };

  const fetchBackendDesigns = async (token?: string) => {
    const owner = ownerRef.current;
    if (owner !== localStorage.getItem(STUDIO_OWNER_KEY) || token !== localStorage.getItem("opticus_token")) return;
    try {
      const data = await apiClient.get<{ designs: SavedDesign[] } | SavedDesign[]>("/designs", comToken(token));
      if (owner === ownerRef.current && isCurrentStudioSession() && token === authTokenRef.current) {
        const remote = (Array.isArray(data) ? data : data.designs).map(design => ({ ...design, remoteId: String(design.id) }));
        const merged = mergeSavedDesigns(remote, readJSON<SavedDesign[]>(localStorage, "opticus_designs", []));
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
          const data = await apiClient.get<{ user: User } | User>("/auth/me", comToken(token));
          if (localStorage.getItem("opticus_token") !== token) return;
          startSession("user" in data ? data.user : data, token);
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

    void initSession().finally(() => setSessionLoading(false));
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

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const data = await apiClient.post<SessionResponse>("/auth/login", { email, password });
      const userData = "user" in data ? data.user : data;
      startSession(userData, data.token);
      return { ok: true, role: userData.role };
    } catch (err) {
      console.error("Falha ao acessar o backend durante o login:", err);
      if (err instanceof ProblemError) {
        return { ok: false, message: err.status === 401 ? translate("auth-login-invalid") : localizeProblem(err.problem) };
      }
      setIsBackendConnected(false);
      return { ok: false, message: translate("auth-login-unavailable") };
    }
  };

  const signup = async ({ name, email, password }: SignUpInput): Promise<AuthResult> => {
    try {
      const data = await apiClient.post<SessionResponse>("/auth/register", { name, email, password });
      const userData = "user" in data ? data.user : data;
      startSession(userData, data.token);
      return { ok: true, role: userData.role };
    } catch (err) {
      console.error("Falha ao acessar o backend durante o cadastro:", err);
      if (err instanceof ProblemError) {
        return { ok: false, message: localizeProblem(err.problem) };
      }
      setIsBackendConnected(false);
      return { ok: false, message: translate("auth-signup-unavailable") };
    }
  };

  const loginWithGoogle: AuthContextValue["loginWithGoogle"] = async (input) => {
    const previousToken = localStorage.getItem("opticus_token");
    try {
      const response = await apiClient.post<{ user: User; token: string }>("/auth/google/exchange", input);
      if (localStorage.getItem("opticus_token") !== previousToken) throw new Error("Session changed");
      startSession(response.user, response.token);
      return { ok: true, role: response.user.role };
    } catch (error) {
      return { ok: false, message: translate(googleErrorKey(error)) };
    }
  };

  const logout = endSession;

  const saveDesign = async (designData: DesignFields & { id?: string | null }): Promise<SavedDesign> => {
    const token = authTokenRef.current;
    const owner = ownerRef.current;
    if (!owner) throw new Error("Aguarde o carregamento da sessão.");
    if (!isCurrentStudioSession()) {
      invalidateLocalSession();
      throw new Error("A sessão mudou em outra aba. Atualize a página antes de salvar.");
    }
    const localId = designData.id ? String(designData.id) : null;
    // BOLA-04: the server generates the id on creation and PUT only changes a
    // design that already exists there. A draft that never synced is created;
    // one with a proven remote identity (same rule as deletion) is updated.
    const known = localId ? readJSON<SavedDesign[]>(localStorage, "opticus_designs", []).find(item => String(item.id) === localId) : undefined;
    const remoteId = known && (known.remoteId || known.syncStatus !== "local") ? String(known.remoteId || known.id) : null;
    let finalId = localId || `design-${Date.now()}`;
    let syncStatus: SavedDesign["syncStatus"] = "local";
    if (token) {
      try {
        const fields = { ...designData };
        delete fields.id;
        const data = remoteId
          ? await apiClient.put<{ id?: string; design?: { id?: string } }>(`/designs/${encodeURIComponent(remoteId)}`, fields, comToken(token))
          : await apiClient.post<{ id?: string; design?: { id?: string } }>("/designs", fields, comToken(token));
        const savedId = data?.id ?? data?.design?.id;
        if (typeof savedId !== "string" || !savedId.trim()) {
          throw new Error("Resposta inválida ao salvar o design. Não foi possível confirmar o salvamento.");
        }
        finalId = savedId;
        syncStatus = "synced";
      } catch (e) {
        // A server rejection (including 5xx) is never an offline draft.
        // Only fetch's transport failure permits the explicitly unsynced copy.
        if (!(e instanceof TypeError)) throw e;
        console.warn("Sem conexão com o servidor; o design ficará apenas neste dispositivo.");
      }
    }

    if (owner !== ownerRef.current || token !== authTokenRef.current || !isCurrentStudioSession()) {
      throw new Error("A sessão mudou durante o salvamento. Abra o Studio novamente.");
    }
    const cached = readJSON<SavedDesign[]>(localStorage, "opticus_designs", []);
    // A synced draft takes the server's id: replace the entry under its local id, not append a copy.
    const existingIndex = cached.findIndex(item => String(item.id) === (localId ?? String(finalId)));
    const previousDesign = cached[existingIndex];
    const newDesign = {
      ...previousDesign,
      ...designData,
      id: finalId,
      syncStatus,
      ...(syncStatus === "synced" ? { remoteId: finalId } : {}),
      createdAt: previousDesign?.createdAt || previousDesign?.created_at || designData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedDesigns = existingIndex >= 0 ? cached.map((item, i) => i === existingIndex ? newDesign : item) : [...cached, newDesign];
    localStorage.setItem("opticus_designs", JSON.stringify(updatedDesigns));
    localStorage.setItem("opticus_active_design", String(existingIndex >= 0 ? existingIndex : updatedDesigns.length - 1));
    localStorage.setItem("opticus_active_design_id", String(finalId));
    setDesigns(updatedDesigns);
    return newDesign;
  };

  const deleteDesign = async (designId: string) => {
    const token = authTokenRef.current;
    const owner = ownerRef.current;
    const checkSession = () => {
      if (!owner || owner !== ownerRef.current || token !== authTokenRef.current || !isCurrentStudioSession()) {
        throw new Error("A sessão mudou durante a exclusão. Atualize a página.");
      }
    };
    checkSession();
    const cached = readJSON<SavedDesign[]>(localStorage, "opticus_designs", []);
    const originalIndex = cached.findIndex(item => String(item.id) === String(designId));
    const design = cached[originalIndex];
    if (!design) throw new Error("Design não encontrado neste dispositivo. Atualize a página.");
    // Offline edits keep their proven remote identity; only never-synced drafts are local-only.
    if (design.remoteId || design.syncStatus !== "local") {
      if (!token) throw new Error("Entre na sua conta novamente para excluir o design.");
      await apiClient.delete(`/designs/${designId}`, comToken(token));
      checkSession();
      await fetchBackendDesigns(token);
      checkSession();
    }
    // Reread after awaits: do not overwrite newer edits from the same account.
    const next = readJSON<SavedDesign[]>(localStorage, "opticus_designs", []).filter(item => String(item.id) !== String(designId));
    localStorage.setItem("opticus_designs", JSON.stringify(next));
    setDesigns(next);
    const activeId = localStorage.getItem("opticus_active_design_id");
    const activeIndex = localStorage.getItem("opticus_active_design");
    if (activeId === String(designId) || (!activeId && activeIndex !== null && Number(activeIndex) === originalIndex)) {
      localStorage.removeItem("opticus_active_design");
      localStorage.removeItem("opticus_active_design_id");
    } else if (activeId) {
      const index = next.findIndex(item => String(item.id) === activeId);
      if (index >= 0) localStorage.setItem("opticus_active_design", String(index));
    } else if (activeIndex !== null && Number(activeIndex) > originalIndex) {
      localStorage.setItem("opticus_active_design", String(Number(activeIndex) - 1));
    }
  };

  const updateUser = async (userId: string, dataToUpdate: UpdateUser): Promise<UserMutation> => {
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

  const deleteUser = async (userId: string): Promise<UserMutation> => {
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
      sessionLoading,
      sessionToken: authTokenRef.current,
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
      loginWithGoogle,
      logout,
      saveDesign,
      deleteDesign,
      deleteBackendDesign: deleteDesign,
      updateUser,
      deleteUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
