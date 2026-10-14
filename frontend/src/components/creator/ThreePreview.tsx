import React from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import EyewearViewer from "../../eyewear/EyewearViewer";
export default function ThreePreview() {
  const { config, environment, autoRotate, view } = useCreatorStudio();
  const { language } = useTranslation();
  return (
    <EyewearViewer
      config={config}
      environment={environment}
      autoRotate={autoRotate}
      view={view}
      language={language}
    />
  );
}
