import React, { createContext, useContext, useState, useEffect } from "react";
import { apiClient, ProblemError, setAuthErrorHandler } from "../api/client";

const AuthContext = createContext<any>(undefined);

export function AuthProvider({ children }) {
  const [designs, setDesigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [authWarning, setAuthWarning] = useState<string | null>(null);

  const clearAuthWarning = () => setAuthWarning(null);

  useEffect(() => {
    setAuthErrorHandler((status, problem) => {
      const message = problem?.title || (status === 401 ? "Acesso não autorizado." : "Acesso negado.");
      if (status === 401) {
        localStorage.removeItem("opticus_token");
        setSession(null);
      } else if (status === 403) {
        setAuthWarning(message);
      }
    });

    return () => {
      setAuthErrorHandler(null);
    };
  }, []);

  const fetchBackendUsers = async () => {
    try {
      const data = await apiClient.get<any>("/auth/users");
      setUsers(data.users || data);
    } catch (e) {
      console.error("Failed to load backend users:", e);
    }
  };

  const fetchBackendDesigns = async () => {
    try {
      const data = await apiClient.get<any>("/designs");
      const designsList = data.designs || data;
      setDesigns(designsList);
      localStorage.setItem("opticus_designs", JSON.stringify(designsList));
    } catch (e) {
      console.error("Failed to load backend designs:", e);
    }
  };

  useEffect(() => {
    async function initSession() {
      const token = localStorage.getItem("opticus_token");
      if (token) {
        try {
          const data = await apiClient.get<any>("/auth/me");
          const userData = data.user || data;
          setSession(userData);
          setIsBackendConnected(true);
          fetchBackendDesigns();
          fetchBackendUsers();
          return;
        } catch (e) {
          console.error("Não foi possível validar a sessão no backend:", e);
          localStorage.removeItem("opticus_token");
        }
      }

      const localDesigns = localStorage.getItem("opticus_designs") || "[]";
      setDesigns(JSON.parse(localDesigns));
    }

    initSession();
  }, []);

  const login = async (email, password) => {
    try {
      const data = await apiClient.post<any>("/auth/login", { email, password });
      localStorage.setItem("opticus_token", data.token);
      const userData = data.user || data;
      setSession(userData);
      setIsBackendConnected(true);
      fetchBackendDesigns();
      return { ok: true, role: userData.role };
    } catch (err: any) {
      console.error("Falha ao acessar o backend durante o login:", err);
      if (err instanceof ProblemError) {
        return { ok: false, message: err.detail || err.title || err.message };
      }
      setIsBackendConnected(false);
      return { ok: false, message: "Serviço de autenticação indisponível. Tente novamente." };
    }
  };

  const signup = async ({ name, email, password }) => {
    try {
      const data = await apiClient.post<any>("/auth/register", { name, email, password });
      localStorage.setItem("opticus_token", data.token);
      const userData = data.user || data;
      setSession(userData);
      setIsBackendConnected(true);
      return { ok: true, role: userData.role };
    } catch (err: any) {
      console.error("Falha ao acessar o backend durante o cadastro:", err);
      if (err instanceof ProblemError) {
        return { ok: false, message: err.detail || err.title || err.message };
      }
      setIsBackendConnected(false);
      return { ok: false, message: "Serviço de cadastro indisponível. Tente novamente." };
    }
  };

  const logout = () => {
    localStorage.removeItem("opticus_token");
    setSession(null);
  };

  const saveDesign = async (designData) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const data = await apiClient.post<any>("/designs", designData);
        fetchBackendDesigns();
        return data.design || data;
      } catch (e) {
        console.error("Backend design save failed, shifting to local cache:", e);
      }
    }

    const newDesign = {
      id: `des-${Date.now()}`,
      ...designData,
      createdAt: new Date().toISOString()
    };
    const updatedDesigns = [...designs, newDesign];
    localStorage.setItem("opticus_designs", JSON.stringify(updatedDesigns));
    setDesigns(updatedDesigns);
    return newDesign;
  };

  const deleteBackendDesign = async (designId) => {
    if (isBackendConnected) {
      try {
        await apiClient.delete(`/designs/${designId}`);
        fetchBackendDesigns();
      } catch (e) {
        console.error("Failed to delete backend design:", e);
      }
    }
  };

  const updateUser = async (userId, dataToUpdate) => {
    if (isBackendConnected) {
      try {
        await apiClient.put(`/auth/users/${userId}`, dataToUpdate);
        fetchBackendUsers();
        return { ok: true };
      } catch (e: any) {
        console.error("User update failed:", e);
        if (e instanceof ProblemError) {
          return { ok: false, message: e.detail || e.title || e.message };
        }
      }
    }

    return { ok: false, message: "Serviço de usuários indisponível." };
  };

  const deleteUser = async (userId) => {
    if (isBackendConnected) {
      try {
        await apiClient.delete(`/auth/users/${userId}`);
        fetchBackendUsers();
        return { ok: true };
      } catch (e: any) {
        console.error("User deletion failed:", e);
        if (e instanceof ProblemError) {
          return { ok: false, message: e.detail || e.title || e.message };
        }
      }
    }

    return { ok: false, message: "Serviço de usuários indisponível." };
  };

  return (
    <AuthContext.Provider value={{
      session,
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
