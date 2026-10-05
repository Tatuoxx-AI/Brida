import type { Locale } from "./locales";

// Textos do site que a dona pode alterar no painel (Editar site → Textos do site).
// Estes são os valores de origem em cada língua. O que a dona alterar fica guardado
// em salon_settings.content (português) e é traduzido para as outras línguas pela IA.

export type Stat = { value: string; label: string };
export type Review = { name: string; rating: number; text: string };

export type SiteContent = {
  brandName: string;
  brandSub: string;
  heroEyebrow: string;
  heroLine1: string;
  heroAccent: string;
  heroLine2: string;
  heroLine3: string;
  heroSubtitle: string;
  heroCtaBook: string;
  heroRatingLabel: string;
  heroBadgeValue: string;
  heroBadgeLabel: string;
  ratingValue: string;
  ratingCount: string;
  marqueeItems: string[];
  marqueeSymbol: string;
  servicesEyebrow: string;
  servicesTitle: string;
  servicesAccent: string;
  servicesText: string;
  servicesCta: string;
  servicesNote: string;
  servicesOnRequest: string;
  galleryEyebrow: string;
  galleryTitle: string;
  galleryAccent: string;
  galleryHint: string;
  aboutEyebrow: string;
  aboutTitle: string;
  aboutAccent: string;
  aboutText: string;
  aboutBadgeLabel: string;
  aboutBadgeText: string;
  aboutStats: Stat[];
  teamEyebrow: string;
  teamTitle: string;
  teamAccent: string;
  teamText: string;
  brandsTitle: string;
  reviewsEyebrow: string;
  reviewsAccent: string;
  reviewsCountLabel: string;
  reviews: Review[];
  agendaEyebrow: string;
  agendaTitle: string;
  agendaAccent: string;
  agendaText: string;
  contactEyebrow: string;
  contactTitle: string;
  contactAccent: string;
  contactDirections: string;
  footerVisit: string;
  footerTalk: string;
  footerOpenMap: string;
  footerProfile: string;
  whatsappMessage: string;
  assistantGreeting: string;
};

export type ContentKey = keyof SiteContent;

/** Campos que não se traduzem (números, símbolos, nomes próprios). */
export const NEUTRAL_KEYS: ContentKey[] = ["brandName", "brandSub", "heroBadgeValue", "ratingValue", "ratingCount", "marqueeSymbol"];

const REVIEWS_PT: Review[] = [
  { name: "Adriana B.", rating: 5, text: "A Claudia tem umas mãos de fada ✨ Serviço fantástico, as madeixas ficam maravilhosas e o cabelo fica tratado." },
  { name: "Susana D.", rating: 5, text: "Adoro o trabalho de todas as meninas que trabalham no Brida, são bastante profissionais e cuidadosas." },
  { name: "Kostiantyn K.", rating: 5, text: "A minha filha fez alisamento de cabelo e ficou top 👍🏻" },
];

const pt: SiteContent = {
  brandName: "Brida",
  brandSub: "Coiffeur · Claudia Rocha",
  heroEyebrow: "Salão de cabeleireiro · Portimão",
  heroLine1: "A arte de",
  heroAccent: "cuidar",
  heroLine2: "do seu",
  heroLine3: "cabelo",
  heroSubtitle:
    "Madeixas, coloração, alisamento e tratamentos tricológicos pelas mãos da Claudia Rocha — e uma equipa dedicada a unhas e sobrancelhas.",
  heroCtaBook: "Marcar online",
  heroRatingLabel: "opiniões no Google",
  heroBadgeValue: "25",
  heroBadgeLabel: "anos de experiência",
  ratingValue: "4,8",
  ratingCount: "40",
  marqueeItems: ["25 anos de experiência", "Tricologia pela USP", "Formação em Londres", "Madeixas · Coloração · Alisamento", "Unhas e sobrancelhas", "Portimão"],
  marqueeSymbol: "✦",
  servicesEyebrow: "Serviços",
  servicesTitle: "Tratamentos",
  servicesAccent: "à sua medida",
  servicesText: "Cada cabelo começa com um diagnóstico. Escolha o serviço, veja as vagas em tempo real e marque em segundos.",
  servicesCta: "Ver vagas e marcar",
  servicesNote: "O preço final depende do comprimento e do diagnóstico do cabelo.",
  servicesOnRequest: "Sob consulta",
  galleryEyebrow: "Antes & depois",
  galleryTitle: "Resultados que",
  galleryAccent: "falam",
  galleryHint: "Arraste a linha para comparar.",
  aboutEyebrow: "Sobre nós",
  aboutTitle: "Claudia",
  aboutAccent: "Rocha",
  aboutText:
    "Com 25 anos de experiência no setor da beleza, a Claudia Rocha trouxe a sua técnica e paixão para Portugal há 6 anos. Especialização académica em tricologia pela USP e formação em Londres. O salão é especializado em cuidados com o cabelo, unhas e sobrancelhas, com tratamentos personalizados e foco em resultados que fidelizam.",
  aboutBadgeLabel: "Especialista",
  aboutBadgeText: "Tricologia e saúde do couro cabeludo",
  aboutStats: [
    { value: "25", label: "anos de experiência" },
    { value: "USP", label: "especialização em tricologia" },
    { value: "Londres", label: "formação internacional" },
  ],
  teamEyebrow: "A nossa equipa",
  teamTitle: "Mãos que",
  teamAccent: "cuidam de si",
  teamText: "Talento, técnica e carinho em cada detalhe — conheça quem vai tratar do seu cabelo.",
  brandsTitle: "Trabalhamos com as melhores marcas",
  reviewsEyebrow: "Opiniões",
  reviewsAccent: "no Google",
  reviewsCountLabel: "opiniões",
  reviews: REVIEWS_PT,
  agendaEyebrow: "Agenda online",
  agendaTitle: "Reserve o seu",
  agendaAccent: "momento",
  agendaText: "Escolha o serviço e a hora na agenda, ou pergunte no Brida Chat, aqui ao lado. Sem pagamentos online: a marcação confirma-se pelo WhatsApp.",
  contactEyebrow: "Contacto",
  contactTitle: "Venha",
  contactAccent: "visitar-nos",
  contactDirections: "Como chegar",
  footerVisit: "Visite-nos",
  footerTalk: "Fale connosco",
  footerOpenMap: "Abrir no mapa",
  footerProfile: "O meu perfil",
  whatsappMessage: "Olá! Gostaria de marcar um serviço no Brida Coiffeur.",
  assistantGreeting: "Olá! Sou o Brida Chat, o assistente do Brida Coiffeur ✨ Posso ajudar com horários, serviços e marcações — a qualquer hora.",
};

const en: SiteContent = {
  ...pt,
  heroEyebrow: "Hair salon · Portimão",
  heroLine1: "The art of",
  heroAccent: "caring",
  heroLine2: "for your",
  heroLine3: "hair",
  heroSubtitle: "Highlights, colour, straightening and trichology treatments by Claudia Rocha — plus a team dedicated to nails and brows.",
  heroCtaBook: "Book online",
  heroRatingLabel: "reviews on Google",
  heroBadgeLabel: "years of experience",
  ratingValue: "4.8",
  marqueeItems: ["25 years of experience", "Trichology at USP", "Trained in London", "Highlights · Colour · Straightening", "Nails and brows", "Portimão"],
  servicesEyebrow: "Services",
  servicesTitle: "Treatments",
  servicesAccent: "made for you",
  servicesText: "Every head of hair starts with a diagnosis. Choose a service, see live availability and book in seconds.",
  servicesCta: "See times & book",
  servicesNote: "The final price depends on hair length and diagnosis.",
  servicesOnRequest: "On request",
  galleryEyebrow: "Before & after",
  galleryTitle: "Results that",
  galleryAccent: "speak",
  galleryHint: "Drag the line to compare.",
  aboutEyebrow: "About us",
  aboutText:
    "With 25 years in the beauty industry, Claudia Rocha brought her craft and passion to Portugal 6 years ago. Academic specialisation in trichology at USP and training in London. The salon specialises in hair, nail and brow care, with personalised treatments and a focus on results that keep clients coming back.",
  aboutBadgeLabel: "Specialist",
  aboutBadgeText: "Trichology and scalp health",
  aboutStats: [
    { value: "25", label: "years of experience" },
    { value: "USP", label: "trichology specialisation" },
    { value: "London", label: "international training" },
  ],
  teamEyebrow: "Our team",
  teamTitle: "Hands that",
  teamAccent: "care for you",
  teamText: "Talent, technique and care in every detail — meet the people who will look after your hair.",
  brandsTitle: "We work with the finest brands",
  reviewsEyebrow: "Reviews",
  reviewsAccent: "on Google",
  reviewsCountLabel: "reviews",
  reviews: [
    { ...REVIEWS_PT[0], text: "Claudia has magic hands ✨ Fantastic service, the highlights look wonderful and the hair stays healthy." },
    { ...REVIEWS_PT[1], text: "I love the work of all the girls at Brida — very professional and caring." },
    { ...REVIEWS_PT[2], text: "My daughter had her hair straightened and it looked amazing 👍🏻" },
  ],
  agendaEyebrow: "Online booking",
  agendaTitle: "Book your",
  agendaAccent: "moment",
  agendaText: "Pick a service and time in the calendar, or ask Brida Chat right next to it. No online payment: you confirm your booking on WhatsApp.",
  contactEyebrow: "Contact",
  contactTitle: "Come and",
  contactAccent: "visit us",
  contactDirections: "Get directions",
  footerVisit: "Visit us",
  footerTalk: "Talk to us",
  footerOpenMap: "Open in maps",
  footerProfile: "My profile",
  whatsappMessage: "Hello! I'd like to book a service at Brida Coiffeur.",
  assistantGreeting: "Hi! I'm Brida Chat, Brida Coiffeur's assistant ✨ I can help with times, services and bookings — any time.",
};

const fr: SiteContent = {
  ...pt,
  heroEyebrow: "Salon de coiffure · Portimão",
  heroLine1: "L'art de",
  heroAccent: "prendre soin",
  heroLine2: "de vos",
  heroLine3: "cheveux",
  heroSubtitle: "Mèches, coloration, lissage et soins trichologiques par Claudia Rocha — et une équipe dédiée aux ongles et aux sourcils.",
  heroCtaBook: "Réserver en ligne",
  heroRatingLabel: "avis sur Google",
  heroBadgeLabel: "ans d'expérience",
  marqueeItems: ["25 ans d'expérience", "Trichologie à l'USP", "Formée à Londres", "Mèches · Coloration · Lissage", "Ongles et sourcils", "Portimão"],
  servicesEyebrow: "Prestations",
  servicesTitle: "Des soins",
  servicesAccent: "sur mesure",
  servicesText: "Chaque chevelure commence par un diagnostic. Choisissez la prestation, voyez les disponibilités en temps réel et réservez en quelques secondes.",
  servicesCta: "Voir les créneaux",
  servicesNote: "Le prix final dépend de la longueur et du diagnostic des cheveux.",
  servicesOnRequest: "Sur demande",
  galleryEyebrow: "Avant & après",
  galleryTitle: "Des résultats qui",
  galleryAccent: "parlent",
  galleryHint: "Faites glisser la ligne pour comparer.",
  aboutEyebrow: "À propos",
  aboutText:
    "Forte de 25 ans d'expérience dans la beauté, Claudia Rocha a apporté son savoir-faire et sa passion au Portugal il y a 6 ans. Spécialisation universitaire en trichologie à l'USP et formation à Londres. Le salon est spécialisé dans les soins des cheveux, des ongles et des sourcils, avec des soins personnalisés et des résultats qui fidélisent.",
  aboutBadgeLabel: "Spécialiste",
  aboutBadgeText: "Trichologie et santé du cuir chevelu",
  aboutStats: [
    { value: "25", label: "ans d'expérience" },
    { value: "USP", label: "spécialisation en trichologie" },
    { value: "Londres", label: "formation internationale" },
  ],
  teamEyebrow: "Notre équipe",
  teamTitle: "Des mains qui",
  teamAccent: "prennent soin de vous",
  teamText: "Talent, technique et attention dans chaque détail — découvrez qui prendra soin de vos cheveux.",
  brandsTitle: "Nous travaillons avec les meilleures marques",
  reviewsEyebrow: "Avis",
  reviewsAccent: "sur Google",
  reviewsCountLabel: "avis",
  reviews: [
    { ...REVIEWS_PT[0], text: "Claudia a des doigts de fée ✨ Service fantastique, les mèches sont magnifiques et les cheveux restent soignés." },
    { ...REVIEWS_PT[1], text: "J'adore le travail de toute l'équipe du Brida, très professionnelle et attentionnée." },
    { ...REVIEWS_PT[2], text: "Ma fille a fait un lissage et le résultat est top 👍🏻" },
  ],
  agendaEyebrow: "Réservation en ligne",
  agendaTitle: "Réservez votre",
  agendaAccent: "moment",
  agendaText: "Choisissez la prestation et l'heure dans l'agenda, ou demandez à Brida Chat juste à côté. Pas de paiement en ligne : la réservation se confirme sur WhatsApp.",
  contactEyebrow: "Contact",
  contactTitle: "Venez nous",
  contactAccent: "rendre visite",
  contactDirections: "Itinéraire",
  footerVisit: "Nous trouver",
  footerTalk: "Nous contacter",
  footerOpenMap: "Ouvrir la carte",
  footerProfile: "Mon profil",
  whatsappMessage: "Bonjour ! Je voudrais réserver une prestation au Brida Coiffeur.",
  assistantGreeting: "Bonjour ! Je suis Brida Chat, l'assistant du Brida Coiffeur ✨ Je peux vous aider pour les horaires, les prestations et les réservations — à toute heure.",
};

const es: SiteContent = {
  ...pt,
  heroEyebrow: "Peluquería · Portimão",
  heroLine1: "El arte de",
  heroAccent: "cuidar",
  heroLine2: "tu",
  heroLine3: "cabello",
  heroSubtitle: "Mechas, coloración, alisado y tratamientos tricológicos de la mano de Claudia Rocha — y un equipo dedicado a uñas y cejas.",
  heroCtaBook: "Reservar online",
  heroRatingLabel: "opiniones en Google",
  heroBadgeLabel: "años de experiencia",
  marqueeItems: ["25 años de experiencia", "Tricología en la USP", "Formación en Londres", "Mechas · Coloración · Alisado", "Uñas y cejas", "Portimão"],
  servicesEyebrow: "Servicios",
  servicesTitle: "Tratamientos",
  servicesAccent: "a tu medida",
  servicesText: "Cada cabello empieza con un diagnóstico. Elige el servicio, consulta la disponibilidad en tiempo real y reserva en segundos.",
  servicesCta: "Ver horarios y reservar",
  servicesNote: "El precio final depende del largo y del diagnóstico del cabello.",
  servicesOnRequest: "A consultar",
  galleryEyebrow: "Antes y después",
  galleryTitle: "Resultados que",
  galleryAccent: "hablan",
  galleryHint: "Arrastra la línea para comparar.",
  aboutEyebrow: "Sobre nosotros",
  aboutText:
    "Con 25 años de experiencia en el sector de la belleza, Claudia Rocha trajo su técnica y pasión a Portugal hace 6 años. Especialización académica en tricología en la USP y formación en Londres. El salón está especializado en el cuidado del cabello, uñas y cejas, con tratamientos personalizados y resultados que fidelizan.",
  aboutBadgeLabel: "Especialista",
  aboutBadgeText: "Tricología y salud del cuero cabelludo",
  aboutStats: [
    { value: "25", label: "años de experiencia" },
    { value: "USP", label: "especialización en tricología" },
    { value: "Londres", label: "formación internacional" },
  ],
  teamEyebrow: "Nuestro equipo",
  teamTitle: "Manos que",
  teamAccent: "te cuidan",
  teamText: "Talento, técnica y cariño en cada detalle — conoce a quien cuidará de tu cabello.",
  brandsTitle: "Trabajamos con las mejores marcas",
  reviewsEyebrow: "Opiniones",
  reviewsAccent: "en Google",
  reviewsCountLabel: "opiniones",
  reviews: [
    { ...REVIEWS_PT[0], text: "Claudia tiene unas manos de hada ✨ Servicio fantástico, las mechas quedan maravillosas y el pelo queda cuidado." },
    { ...REVIEWS_PT[1], text: "Me encanta el trabajo de todas las chicas del Brida, muy profesionales y cuidadosas." },
    { ...REVIEWS_PT[2], text: "Mi hija se hizo un alisado y quedó genial 👍🏻" },
  ],
  agendaEyebrow: "Reserva online",
  agendaTitle: "Reserva tu",
  agendaAccent: "momento",
  agendaText: "Elige el servicio y la hora en la agenda, o pregunta a Brida Chat aquí al lado. Sin pagos online: la reserva se confirma por WhatsApp.",
  contactEyebrow: "Contacto",
  contactTitle: "Ven a",
  contactAccent: "visitarnos",
  contactDirections: "Cómo llegar",
  footerVisit: "Visítanos",
  footerTalk: "Habla con nosotros",
  footerOpenMap: "Abrir en el mapa",
  footerProfile: "Mi perfil",
  whatsappMessage: "¡Hola! Me gustaría reservar un servicio en Brida Coiffeur.",
  assistantGreeting: "¡Hola! Soy Brida Chat, el asistente de Brida Coiffeur ✨ Te ayudo con horarios, servicios y reservas — a cualquier hora.",
};

const de: SiteContent = {
  ...pt,
  heroEyebrow: "Friseursalon · Portimão",
  heroLine1: "Die Kunst,",
  heroAccent: "Ihr Haar",
  heroLine2: "zu",
  heroLine3: "pflegen",
  heroSubtitle: "Strähnen, Coloration, Glättung und trichologische Behandlungen von Claudia Rocha — dazu ein Team für Nägel und Augenbrauen.",
  heroCtaBook: "Online buchen",
  heroRatingLabel: "Bewertungen auf Google",
  heroBadgeLabel: "Jahre Erfahrung",
  marqueeItems: ["25 Jahre Erfahrung", "Trichologie an der USP", "Ausbildung in London", "Strähnen · Coloration · Glättung", "Nägel und Augenbrauen", "Portimão"],
  servicesEyebrow: "Leistungen",
  servicesTitle: "Behandlungen",
  servicesAccent: "nach Maß",
  servicesText: "Jedes Haar beginnt mit einer Diagnose. Wählen Sie die Leistung, sehen Sie freie Termine in Echtzeit und buchen Sie in Sekunden.",
  servicesCta: "Termine ansehen",
  servicesNote: "Der Endpreis hängt von Haarlänge und Diagnose ab.",
  servicesOnRequest: "Auf Anfrage",
  galleryEyebrow: "Vorher & nachher",
  galleryTitle: "Ergebnisse, die",
  galleryAccent: "überzeugen",
  galleryHint: "Ziehen Sie die Linie zum Vergleichen.",
  aboutEyebrow: "Über uns",
  aboutText:
    "Mit 25 Jahren Erfahrung in der Beauty-Branche brachte Claudia Rocha vor 6 Jahren ihr Können und ihre Leidenschaft nach Portugal. Akademische Spezialisierung in Trichologie an der USP und Ausbildung in London. Der Salon ist auf Haar-, Nagel- und Augenbrauenpflege spezialisiert — mit individuellen Behandlungen und Ergebnissen, die überzeugen.",
  aboutBadgeLabel: "Spezialistin",
  aboutBadgeText: "Trichologie und Kopfhautgesundheit",
  aboutStats: [
    { value: "25", label: "Jahre Erfahrung" },
    { value: "USP", label: "Spezialisierung in Trichologie" },
    { value: "London", label: "internationale Ausbildung" },
  ],
  teamEyebrow: "Unser Team",
  teamTitle: "Hände, die",
  teamAccent: "Sie verwöhnen",
  teamText: "Talent, Technik und Liebe zum Detail — lernen Sie die Menschen kennen, die sich um Ihr Haar kümmern.",
  brandsTitle: "Wir arbeiten mit den besten Marken",
  reviewsEyebrow: "Bewertungen",
  reviewsAccent: "auf Google",
  reviewsCountLabel: "Bewertungen",
  reviews: [
    { ...REVIEWS_PT[0], text: "Claudia hat goldene Hände ✨ Fantastischer Service, die Strähnen werden wunderschön und das Haar bleibt gepflegt." },
    { ...REVIEWS_PT[1], text: "Ich liebe die Arbeit aller Mitarbeiterinnen im Brida — sehr professionell und sorgfältig." },
    { ...REVIEWS_PT[2], text: "Meine Tochter hat sich die Haare glätten lassen — super Ergebnis 👍🏻" },
  ],
  agendaEyebrow: "Online-Buchung",
  agendaTitle: "Buchen Sie Ihren",
  agendaAccent: "Moment",
  agendaText: "Wählen Sie Leistung und Uhrzeit im Kalender oder fragen Sie Brida Chat gleich daneben. Keine Online-Zahlung: Die Buchung wird per WhatsApp bestätigt.",
  contactEyebrow: "Kontakt",
  contactTitle: "Besuchen",
  contactAccent: "Sie uns",
  contactDirections: "Route planen",
  footerVisit: "Besuchen Sie uns",
  footerTalk: "Kontakt",
  footerOpenMap: "In Karten öffnen",
  footerProfile: "Mein Profil",
  whatsappMessage: "Hallo! Ich möchte gern einen Termin im Brida Coiffeur buchen.",
  assistantGreeting: "Hallo! Ich bin Brida Chat, der Assistent des Brida Coiffeur ✨ Ich helfe bei Terminen, Leistungen und Buchungen — rund um die Uhr.",
};

export const DEFAULT_CONTENT: Record<Locale, SiteContent> = { pt, en, fr, es, de };

/** Campos do painel, agrupados como aparecem no site. */
export const CONTENT_FIELDS: { group: string; fields: { key: ContentKey; label: string; long?: boolean; kind?: "list" | "stats" | "reviews" }[] }[] = [
  { group: "Logótipo", fields: [{ key: "brandName", label: "Nome (grande)" }, { key: "brandSub", label: "Linha por baixo do nome" }] },
  {
    group: "Topo da página",
    fields: [
      { key: "heroEyebrow", label: "Linha pequena por cima do título" },
      { key: "heroLine1", label: "Título — 1.ª linha" },
      { key: "heroAccent", label: "Título — palavra em dourado" },
      { key: "heroLine2", label: "Título — a seguir à palavra dourada" },
      { key: "heroLine3", label: "Título — última linha (antes do ponto final)" },
      { key: "heroSubtitle", label: "Texto por baixo do título", long: true },
      { key: "heroCtaBook", label: "Botão de marcar" },
      { key: "ratingValue", label: "Nota do Google (ex.: 4,8)" },
      { key: "ratingCount", label: "N.º de opiniões no Google" },
      { key: "heroRatingLabel", label: "Texto ao lado das estrelas" },
      { key: "heroBadgeValue", label: "Destaque sobre a foto — número" },
      { key: "heroBadgeLabel", label: "Destaque sobre a foto — texto" },
    ],
  },
  {
    group: "Faixa que desliza",
    fields: [
      { key: "marqueeItems", label: "Frases (uma por linha)", kind: "list" },
      { key: "marqueeSymbol", label: "Símbolo entre as frases (ex.: ✦ ✧ ❖ •)" },
    ],
  },
  {
    group: "Serviços",
    fields: [
      { key: "servicesEyebrow", label: "Linha pequena" },
      { key: "servicesTitle", label: "Título" },
      { key: "servicesAccent", label: "Título — parte dourada" },
      { key: "servicesText", label: "Texto", long: true },
      { key: "servicesCta", label: "Botão" },
      { key: "servicesNote", label: "Nota ao lado do botão" },
      { key: "servicesOnRequest", label: "Texto quando não há preço" },
    ],
  },
  {
    group: "Antes & depois",
    fields: [
      { key: "galleryEyebrow", label: "Linha pequena" },
      { key: "galleryTitle", label: "Título" },
      { key: "galleryAccent", label: "Título — parte dourada" },
      { key: "galleryHint", label: "Dica ao lado" },
    ],
  },
  {
    group: "Sobre nós",
    fields: [
      { key: "aboutEyebrow", label: "Linha pequena" },
      { key: "aboutTitle", label: "Título" },
      { key: "aboutAccent", label: "Título — parte dourada" },
      { key: "aboutText", label: "Texto", long: true },
      { key: "aboutBadgeLabel", label: "Selo sobre a foto — linha pequena" },
      { key: "aboutBadgeText", label: "Selo sobre a foto — texto" },
      { key: "aboutStats", label: "Três destaques (número + texto)", kind: "stats" },
    ],
  },
  {
    group: "A nossa equipa",
    fields: [
      { key: "teamEyebrow", label: "Linha pequena" },
      { key: "teamTitle", label: "Título" },
      { key: "teamAccent", label: "Título — parte dourada" },
      { key: "teamText", label: "Texto", long: true },
    ],
  },
  { group: "Marcas", fields: [{ key: "brandsTitle", label: "Frase por cima dos logótipos" }] },
  {
    group: "Opiniões",
    fields: [
      { key: "reviewsEyebrow", label: "Linha pequena" },
      { key: "reviewsAccent", label: "Título — parte dourada (a nota aparece antes)" },
      { key: "reviewsCountLabel", label: "Palavra depois do número de opiniões" },
      { key: "reviews", label: "Depoimentos", kind: "reviews" },
    ],
  },
  {
    group: "Agenda",
    fields: [
      { key: "agendaEyebrow", label: "Linha pequena" },
      { key: "agendaTitle", label: "Título" },
      { key: "agendaAccent", label: "Título — parte dourada" },
      { key: "agendaText", label: "Texto", long: true },
    ],
  },
  {
    group: "Contacto e rodapé",
    fields: [
      { key: "contactEyebrow", label: "Linha pequena" },
      { key: "contactTitle", label: "Título" },
      { key: "contactAccent", label: "Título — parte dourada" },
      { key: "contactDirections", label: "Link do mapa" },
      { key: "footerVisit", label: "Rodapé — título da morada" },
      { key: "footerTalk", label: "Rodapé — título dos contactos" },
      { key: "footerOpenMap", label: "Rodapé — link do mapa" },
      { key: "footerProfile", label: "Rodapé — link do perfil" },
      { key: "whatsappMessage", label: "Mensagem que abre no WhatsApp", long: true },
    ],
  },
];
