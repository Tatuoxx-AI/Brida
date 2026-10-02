import type { MetadataRoute } from "next";

// O site como app no telemóvel ("Adicionar ao ecrã principal"). O painel do
// gerente tem o seu próprio manifesto, servido no endereço secreto.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brida Coiffeur By Claudia Rocha",
    short_name: "Brida",
    description: "Marque o seu horário no Brida Coiffeur, em Portimão.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141210",
    theme_color: "#141210",
    lang: "pt-PT",
    icons: [
      { src: "/icone-app/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-app/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-app/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Marcar horário", url: "/#agenda" }],
  };
}
