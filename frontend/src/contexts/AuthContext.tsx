import React, { createContext, useContext, useState, useEffect } from "react";
import { mergeSavedDesigns, readJSON } from "../eyewear/storage";
import { apiFetch, setAuthErrorHandler } from "../utils/api";

let API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
if (!API_URL.endsWith('/api')) API_URL = `${API_URL}/api`;
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

  const fetchBackendUsers = async (token?: string) => {
    try {
      const res = await apiFetch(`${API_URL}/auth/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users);
      }
    } catch (e) {
      console.error("Failed to load backend users:", e);
    }
  };

  const fetchBackendDesigns = async (token?: string) => {
    try {
      const res = await apiFetch(`${API_URL}/designs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const merged = mergeSavedDesigns(data.designs, readJSON(localStorage, "opticus_designs", []));
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
      if (token) {
        try {
          const res = await apiFetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setSession(data.user);
            setIsBackendConnected(true);
            fetchBackendDesigns(token);
            fetchBackendUsers(token);
            return;
          }
        } catch (e) {
          console.error("Não foi possível validar a sessão no backend:", e);
        }
        localStorage.removeItem("opticus_token");
      }

      setDesigns(readJSON(localStorage, "opticus_designs", []));
    }

    initSession();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem("opticus_token", data.token);
        setSession(data.user);
        setIsBackendConnected(true);
        fetchBackendDesigns(data.token);
        return { ok: true, role: data.user.role };
      } else {
        return { ok: false, message: data.error || "Login failed." };
      }
    } catch (err) {
      console.error("Falha ao acessar o backend durante o login:", err);
      setIsBackendConnected(false);
      return { ok: false, message: "Serviço de autenticação indisponível. Tente novamente." };
    }
  };

  const signup = async ({ name, email, password }) => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem("opticus_token", data.token);
        setSession(data.user);
        setIsBackendConnected(true);
        return { ok: true, role: data.user.role };
      } else {
        return { ok: false, message: data.error || "Signup failed." };
      }
    } catch (err) {
      console.error("Falha ao acessar o backend durante o cadastro:", err);
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
    let finalId = designData.id || `design-${Date.now()}`;
    let syncStatus = "local";
    if (isBackendConnected && token) {
      try {
        const res = await apiFetch(`${API_URL}/designs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ ...designData, id: finalId })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          finalId = data.id || data.design?.id || finalId;
          syncStatus = "synced";
        }
      } catch (e) {
        console.error("Backend design save failed, shifting to local cache:", e);
      }
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
        await apiFetch(`${API_URL}/designs/${designId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
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
        const res = await apiFetch(`${API_URL}/auth/users/${userId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(dataToUpdate)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          fetchBackendUsers(token);
          return { ok: true };
        }
        return { ok: false, message: data.title || data.error };
      } catch (e) {
        console.error("User update failed:", e);
      }
    }

    return { ok: false, message: "Serviço de usuários indisponível." };
  };

  const deleteUser = async (userId) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const res = await apiFetch(`${API_URL}/auth/users/${userId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          fetchBackendUsers(token);
          return { ok: true };
        }
        return { ok: false, message: data.title || data.error };
      } catch (e) {
        console.error("User deletion failed:", e);
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
