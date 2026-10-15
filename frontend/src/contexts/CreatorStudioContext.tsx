import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { normalizeConfig, type EyewearConfig } from "../eyewear/config";
import { restoreStudio, STUDIO_OWNER_KEY } from "../eyewear/storage";
import { useAuth } from "./AuthContext";
import type { CameraView } from "../eyewear/EyewearViewer";

function useStudioState(owner: string) {
  const [initial] = useState(() => restoreStudio(localStorage));
  const [config, setConfig] = useState(initial.config);
  const [activeStep, setActiveStep] = useState(1);
  const [tryOnMode, setTryOnMode] = useState(false);
  const [environment, setEnvironment] = useState("studio");
  const [view, setCameraView] = useState<CameraView>("perspective");
  const [autoRotate, setAutoRotate] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState<"saved" | "error">("saved");
  const [designId, setDesignId] = useState<string | undefined>(
    initial.designId,
  );
  const [designName, setDesignName] = useState(initial.name || "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const source = useRef(initial.source);
  const patchConfig = (patch: Partial<EyewearConfig>) =>
    setConfig((previous) => normalizeConfig({ ...previous, ...patch }));
  const showToast = (message: string) => {
    clearTimeout(timer.current);
    setStatusMessage(message);
    timer.current = setTimeout(() => setStatusMessage(""), 5000);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (localStorage.getItem(STUDIO_OWNER_KEY) !== owner) return;
    try {
      localStorage.setItem(
        "opticus_creator_draft",
        JSON.stringify({
          version: 2,
          source: source.current,
          config,
          updatedAt: new Date().toISOString(),
        }),
      );
      setDraftStatus("saved");
    } catch {
      setDraftStatus("error");
    }
  }, [config]);
  const markSaved = (id: string) => {
    if (localStorage.getItem(STUDIO_OWNER_KEY) !== owner) return;
    setDesignId(id);
    source.current = "design:" + id;
    localStorage.setItem(
      "opticus_creator_draft",
      JSON.stringify({ version: 2, source: source.current, config }),
    );
  };
  const toggleLensTreatment = (treatment: string) =>
    setConfig((previous) => ({
      ...previous,
      lensTreatments: previous.lensTreatments.includes(treatment)
        ? previous.lensTreatments.filter((t) => t !== treatment)
        : [...previous.lensTreatments, treatment],
    }));
  return {
    config,
    patchConfig,
    activeStep,
    setActiveStep,
    tryOnMode,
    setTryOnMode,
    environment,
    setEnvironment,
    view,
    setCameraView,
    autoRotate,
    setAutoRotate,
    statusMessage,
    showToast,
    draftStatus,
    designId,
    designName,
    setDesignName,
    markSaved,
    toggleLensTreatment,
  };
}
const StudioContext = createContext<
  ReturnType<typeof useStudioState> | undefined
>(undefined);
export function CreatorStudioProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { studioOwner, studioSessionChanged } = useAuth();
  if (studioSessionChanged) return <div className="page-wrapper" role="alert">
    <p>A sessão mudou em outra aba. Atualize a página para continuar.</p>
    <button className="btn" onClick={() => window.location.reload()}>Atualizar página</button>
  </div>;
  if (!studioOwner) return <p role="status">Carregando Studio…</p>;
  return <StudioWorkspace key={studioOwner} owner={studioOwner}>{children}</StudioWorkspace>;
}
function StudioWorkspace({ children, owner }: { children: React.ReactNode; owner: string }) {
  return (
    <StudioContext.Provider value={useStudioState(owner)}>
      {children}
    </StudioContext.Provider>
  );
}
export function useCreatorStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("CreatorStudioProvider is required");
  return value;
}
