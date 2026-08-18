import React, { createContext, useContext, useState, useEffect } from "react";

let API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
if (!API_URL.endsWith('/api')) API_URL = `${API_URL}/api`;
const AuthContext = createContext<any>(undefined);

export function AuthProvider({ children }) {
  const [designs, setDesigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);

  const fetchBackendUsers = async (token) => {
    try {
      const res = await fetch(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users);
      }
    } catch (e) {
      console.error("Failed to load backend users:", e);
    }
  };

  const fetchBackendDesigns = async (token) => {
    try {
      const res = await fetch(`${API_URL}/designs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDesigns(data.designs);
        localStorage.setItem("opticus_designs", JSON.stringify(data.designs));
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
          const res = await fetch(`${API_URL}/auth/me`, {
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

      const localDesigns = localStorage.getItem("opticus_designs") || "[]";
      setDesigns(JSON.parse(localDesigns));
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
    if (isBackendConnected && token) {
      try {
        const res = await fetch(`${API_URL}/designs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(designData)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          fetchBackendDesigns(token);
          return data.design;
        }
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
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await fetch(`${API_URL}/designs/${designId}`, {
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
        const res = await fetch(`${API_URL}/auth/users/${userId}`, {
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
        return { ok: false, message: data.error };
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
        const res = await fetch(`${API_URL}/auth/users/${userId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          fetchBackendUsers(token);
          return { ok: true };
        }
        return { ok: false, message: data.error };
      } catch (e) {
        console.error("User deletion failed:", e);
      }
    }

    return { ok: false, message: "Serviço de usuários indisponível." };
  };

  return (
    <AuthContext.Provider value={{
      session,
      users,
      designs,
      isBackendConnected,
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
