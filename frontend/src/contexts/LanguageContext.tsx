import React, { createContext, useContext, useState, useEffect } from "react";

const translations = {
  en: {
    "nav-explore": "EXPLORE",
    "nav-studio": "STUDIO",
    "nav-import": "IMPORT",
    "nav-my-designs": "MY DESIGNS",
    "nav-login": "Login",
    "nav-dashboard": "Dashboard",
    "nav-logout": "Logout",
    "hero-eyebrow-marketplace": "3D Eyewear Platform",
    "hero-title-marketplace": "Design eyewear that feels made for you.",
    "hero-desc-marketplace": "Opticus combines a curated marketplace with a real-time 3D studio, so you can start from a base frame, refine the design and move from inspiration to customization in one seamless flow.",
    "btn-start-studio": "START IN THE 3D STUDIO",
    "btn-explore-catalog": "EXPLORE THE CATALOG",
    "hero-tags-realtime": "Real-time 3D",
    "hero-tags-customizable": "Customizable frames",
    "hero-tags-workflow": "Saved design workflow",
    "hero-card-label": "What makes Opticus different",
    "hero-card-title": "Start with a frame. End with your own product.",
    "hero-card-desc": "Browse silhouettes, open them in the studio and fine-tune fit, finish and export-ready details from one product journey.",
    "hero-stat-1-title": "Live",
    "hero-stat-1-desc": "3D studio workflow",
    "hero-stat-2-title": "Base + custom",
    "hero-stat-2-desc": "catalog to creator",
    "hero-stat-3-title": "Save",
    "hero-stat-3-desc": "private or published designs",
    "journey-01-title": "Explore a starting point",
    "journey-01-desc": "Discover shapes, materials and community concepts in one premium catalog.",
    "journey-02-title": "Open the 3D studio",
    "journey-02-desc": "Adjust silhouette, fit and finish with a live product preview.",
    "journey-03-title": "Save or export the design",
    "journey-03-desc": "Keep iterations locally, publish concepts and export production-ready files.",
    "filter-refine": "Refine selection",
    "filter-by": "FILTER BY",
    "filter-shape": "Shape",
    "filter-round": "Round",
    "filter-square": "Square",
    "filter-material": "Material",
    "hero-eyebrow-studio": "3D Design Studio",
    "hero-title-studio": "Create eyewear in real time.",
    "hero-desc-studio": "This is the core Opticus experience: choose a silhouette, tune proportions, adjust finish and inspect the result on a live product stage before saving or exporting.",
    "btn-start-shaping": "START SHAPING THE FRAME",
    "btn-open-saved": "OPEN SAVED DESIGNS",
    "hero-stats-shape": "Shape",
    "hero-stats-shape-desc": "build the silhouette",
    "hero-stats-fit": "Fit",
    "hero-stats-fit-desc": "tune proportions live",
    "hero-stats-export": "Export",
    "hero-stats-export-desc": "carry the concept forward",
    "studio-workflow": "Studio workflow",
    "studio-title": "Move from idea to product in three steps",
    "studio-desc": "Start with the silhouette, refine fit and finish, then save or export the concept without leaving the studio.",
    "step-shape": "Shape",
    "step-fit": "Fit",
    "step-finish": "Finish",
    "silhouette-kicker": "Silhouette",
    "silhouette-title": "Pick the base expression",
    "silhouette-desc": "Define the frame character before tuning the proportions.",
    "btn-round": "ROUND",
    "btn-square": "SQUARE",
    "btn-hexagon": "HEXAGON",
    "fit-kicker": "Fit",
    "fit-title": "Tune proportions",
    "fit-desc": "Use the sliders below to refine size, balance and stance.",
    "control-frame-width": "FRAME WIDTH",
    "control-lens-size": "LENS SIZE",
    "control-leg-length": "LEG LENGTH",
    "control-thickness": "THICKNESS",
    "finish-kicker": "Finish",
    "finish-title": "Material language",
    "finish-desc": "Color, bridge and profile change the whole product mood.",
    "welcome": "Welcome",
    "lang-label": "Language",
    "nav-cart": "CART",
    "cart-title": "Shopping Cart",
    "cart-empty": "Your shopping cart is empty.",
    "cart-subtotal": "Subtotal",
    "cart-items": "items",
    "cart-checkout": "PROCEED TO PIX PAYMENT",
    "cart-clear": "Clear Cart",
    "cart-qty": "Qty",
    "cart-item-added": "Design added to cart!",
    "cart-item-removed": "Item removed from cart.",
    "checkout-success": "Payment confirmed successfully!",
    "checkout-success-desc": "Your customized design is now queued for production at our partner factory!",
    "btn-add-to-cart": "ADD TO CART",
    "btn-save-close": "SAVE DESIGN",
    "toast-offline-checkout": "Offline Mode: Simulated order created locally."
  },
  pt: {
    "nav-explore": "EXPLORAR",
    "nav-studio": "ESTÚDIO",
    "nav-import": "IMPORTAR",
    "nav-my-designs": "MEUS DESIGNS",
    "nav-login": "Login",
    "nav-dashboard": "Painel",
    "nav-logout": "Sair",
    "hero-eyebrow-marketplace": "Plataforma 3D de Óculos",
    "hero-title-marketplace": "Design óculos feitos para você.",
    "hero-desc-marketplace": "Opticus combina um marketplace curado com um estúdio 3D em tempo real, para que você comece com uma armação base, refine o design e passe de tempo de tempo de inspiração para customização em um fluxo contínuo.",
    "btn-start-studio": "COMEÇAR NO ESTÚDIO 3D",
    "btn-explore-catalog": "EXPLORAR O CATÁLOGO",
    "hero-tags-realtime": "3D em tempo real",
    "hero-tags-customizable": "Armações personalizáveis",
    "hero-tags-workflow": "Fluxo de designs salvos",
    "hero-card-label": "O que torna Opticus diferente",
    "hero-card-title": "Comece com uma armação. Termine com seu próprio produto.",
    "hero-card-desc": "Navegue por silhuetas, abra-as no estúdio e ajuste fino de encaixe, acabamento e detalhes prontos para produção em uma jornada de produto.",
    "hero-stat-1-title": "Ao vivo",
    "hero-stat-1-desc": "fluxo de estúdio 3D",
    "hero-stat-2-title": "Base + customizado",
    "hero-stat-2-desc": "catálogo para criador",
    "hero-stat-3-title": "Salvar",
    "hero-stat-3-desc": "designs privados ou publicados",
    "journey-01-title": "Explore um ponto de partida",
    "journey-01-desc": "Descubra formas, materiais e conceitos da comunidade em um catálogo premium.",
    "journey-02-title": "Abra o estúdio 3D",
    "journey-02-desc": "Ajuste silhueta, encaixe e acabamento com uma prévia de produto ao vivo.",
    "journey-03-title": "Salve ou exporte o design",
    "journey-03-desc": "Mantenha iterações localmente, publique conceitos e exporte arquivos prontos para produção.",
    "filter-refine": "Refinar seleção",
    "filter-by": "FILTRAR POR",
    "filter-shape": "Forma",
    "filter-round": "Redondo",
    "filter-square": "Quadrado",
    "filter-material": "Material",
    "hero-eyebrow-studio": "Estúdio de Design 3D",
    "hero-title-studio": "Crie óculos em tempo real.",
    "hero-desc-studio": "Esta é a experiência central do Opticus: escolha uma silhueta, ajuste proporções, refine o acabamento e inspecione o resultado em um palco de produto ao vivo antes de salvar ou exportar.",
    "btn-start-shaping": "COMEÇAR A DAR FORMA À ARMAÇÃO",
    "btn-open-saved": "ABRIR DESIGNS SALVOS",
    "hero-stats-shape": "Forma",
    "hero-stats-shape-desc": "construir a silhueta",
    "hero-stats-fit": "Encaixe",
    "hero-stats-fit-desc": "ajustar proporções ao vivo",
    "hero-stats-export": "Exportar",
    "hero-stats-export-desc": "levar o conceito adiante",
    "studio-workflow": "Fluxo de trabalho do estúdio",
    "studio-title": "Mude de ideia para produto em três passos",
    "studio-desc": "Comece com a silhueta, refine o encaixe e o encaixe/acabamento, depois salve ou exporte o conceito sem sair do estúdio.",
    "step-shape": "Forma",
    "step-fit": "Encaixe",
    "step-finish": "Acabamento",
    "silhouette-kicker": "Silhueta",
    "silhouette-title": "Escolha a expressão base",
    "silhouette-desc": "Defina o caráter da armação antes de ajustar as proporções.",
    "btn-round": "REDONDO",
    "btn-square": "QUADRADO",
    "btn-hexagon": "HEXÁGONO",
    "fit-kicker": "Encaixe",
    "fit-title": "Ajuste de proporções",
    "fit-desc": "Use os controles deslizantes abaixo para refinar tamanho, equilíbrio e posição.",
    "control-frame-width": "LARGURA DA ARMAÇÃO",
    "control-lens-size": "TAMANHO DA LENTE",
    "control-leg-length": "COMPRIMENTO DA HASTE",
    "control-thickness": "ESPESSURA",
    "finish-kicker": "Acabamento",
    "finish-title": "Linguagem de material",
    "finish-desc": "Cor, ponte e perfil mudam todo o humor do produto.",
    "welcome": "Bem-vindo",
    "lang-label": "Idioma",
    "nav-cart": "CARRINHO",
    "cart-title": "Carrinho de Compras",
    "cart-empty": "Seu carrinho de compras está vazio.",
    "cart-subtotal": "Subtotal",
    "cart-items": "itens",
    "cart-checkout": "PROSSEGUIR PARA O PAGAMENTO PIX",
    "cart-clear": "Limpar Carrinho",
    "cart-qty": "Qtd",
    "cart-item-added": "Design adicionado ao carrinho!",
    "cart-item-removed": "Item removido do carrinho.",
    "checkout-success": "Pagamento confirmado com sucesso!",
    "checkout-success-desc": "Seu design personalizado agora está na fila de produção em nossa fábrica parceira!",
    "btn-add-to-cart": "ADICIONAR AO CARRINHO",
    "btn-save-close": "SALVAR DESIGN",
    "toast-offline-checkout": "Modo Offline: Pedido simulado criado localmente."
  }
};

const LanguageContext = createContext<any>(undefined);

export function LanguageProvider({ children }) {
  const [language, setLangState] = useState(() => {
    return localStorage.getItem("opticus_language") || "en";
  });

  const setLanguage = (lang) => {
    if (translations[lang]) {
      setLangState(lang);
      localStorage.setItem("opticus_language", lang);
    }
  };

  const t = (key) => {
    return translations[language]?.[key] || translations["en"]?.[key] || key;
  };

  useEffect(() => {
    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}
