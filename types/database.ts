// Tipos da base de dados, espelho de supabase/schema.sql no formato do
// `supabase gen types typescript`. Depois de ligar o projeto Supabase, é possível
// gerar a versão oficial com `npm run db:types` e comparar.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string; // ISO 8601 (timestamptz)
type DateOnly = string; // 'YYYY-MM-DD'
type TimeOfDay = string; // 'HH:MM:SS'
type Money = number; // numeric(10,2)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export type UserRole = "admin" | "staff" | "client";
export type AppointmentStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
export type AppointmentSource = "web" | "ai_chat" | "admin" | "whatsapp";
export type ServiceCategory =
  | "corte"
  | "coloracao"
  | "tratamento"
  | "penteado"
  | "barbearia"
  | "unhas"
  | "sobrancelhas"
  | "estetica";
export type WaitlistStatus = "waiting" | "notified" | "booked" | "expired" | "cancelled";
export type WaitlistPeriod = "qualquer" | "manha" | "tarde" | "noite";
export type PaymentKind = "deposit" | "balance" | "order";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PaymentMethod = "card" | "cash" | "mbway" | "transfer" | "other";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "cancelled" | "refunded";
export type OrderFulfillment = "pickup_at_appointment" | "pickup" | "shipping";
export type DiscountType = "fixed" | "percent";
export type NoteKind = "tecnica" | "geral" | "alergia";
export type AdminEventType =
  | "appointment_requested"
  | "appointment_confirmed"
  | "appointment_created"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "waitlist_joined"
  | "review_received"
  | "order_paid";

/** Fórmula de coloração guardada em client_notes.formula. Campos livres. */
export type ColorFormula = {
  marca?: string;
  tom?: string;
  oxidante?: string;
  proporcao?: string;
  pausa_min?: number;
  [campo: string]: Json | undefined;
};

// ---------------------------------------------------------------------------
// Linhas (Row) — o que vem do SELECT
// ---------------------------------------------------------------------------
export type SalonSettingsRow = {
  id: number;
  name: string;
  tagline: string | null;
  about: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  maps_embed_url: string | null;
  instagram_url: string | null;
  google_review_url: string | null;
  timezone: string;
  currency: string;
  slot_interval_minutes: number;
  min_lead_minutes: number;
  booking_horizon_days: number;
  require_whatsapp_confirmation: boolean;
  deposit_percent: number;
  min_deposit: Money;
  hold_minutes: number;
  cancellation_window_hours: number;
  loyalty_points_per_unit: number;
  area: string | null;
  facebook_url: string | null;
  assistant_name: string;
  assistant_greeting: string;
  assistant_instructions: string | null;
  loyalty_stamps_required: number;
  loyalty_reward: string;
  auto_confirm_whatsapp: boolean;
  reminder_24h: boolean;
  birthday_message: boolean;
  ai_whatsapp_reply: boolean;
  telegram_notify: boolean;
  hero_image_url: string | null;
  about_image_url: string | null;
  updated_at: Timestamp;
};

export type BusinessHoursRow = {
  weekday: number; // 0 = domingo
  opens_at: TimeOfDay | null;
  closes_at: TimeOfDay | null;
  is_closed: boolean;
};

export type ProfileRow = {
  id: string;
  user_id: string | null;
  role: UserRole;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  loyalty_points: number;
  loyalty_code: string;
  birth_date: DateOnly | null;
  marketing_opt_in: boolean;
  bio: string | null;
  commission_rate: number;
  calendar_color: string | null;
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type StaffWorkingHoursRow = {
  id: string;
  staff_id: string;
  weekday: number;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
};

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  category: ServiceCategory;
  duration_minutes: number;
  price: Money;
  is_addon: boolean;
  deposit_amount: Money | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type StaffServiceRow = {
  staff_id: string;
  service_id: string;
};

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: Money;
  stock: number;
  image_url: string | null;
  brand: string | null;
  related_service_categories: ServiceCategory[];
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type OffPeakDiscountRow = {
  id: string;
  name: string;
  weekday: number | null;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
  discount_percent: number;
  service_id: string | null;
  valid_from: DateOnly | null;
  valid_until: DateOnly | null;
  active: boolean;
  created_at: Timestamp;
};

export type GalleryItemRow = {
  id: string;
  title: string | null;
  before_url: string | null;
  after_url: string;
  service_id: string | null;
  staff_id: string | null;
  sort_order: number;
  published: boolean;
  created_at: Timestamp;
};

export type AppointmentRow = {
  id: string;
  code: string;
  client_id: string | null;
  staff_id: string;
  service_id: string;
  start_time: Timestamp;
  end_time: Timestamp;
  status: AppointmentStatus;
  source: AppointmentSource;
  total_price: Money;
  discount_amount: Money;
  deposit_amount: Money;
  deposit_paid: boolean;
  tip_amount: Money;
  guest_name: string | null;
  guest_phone: string | null;
  notes: string | null;
  hold_expires_at: Timestamp | null;
  stripe_checkout_session_id: string | null;
  confirmation_sent_at: Timestamp | null;
  confirmed_at: Timestamp | null;
  reminder_sent_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AppointmentServiceRow = {
  appointment_id: string;
  service_id: string;
  price: Money;
  duration_minutes: number;
  position: number;
};

export type BlockedSlotRow = {
  id: string;
  staff_id: string | null;
  start_time: Timestamp;
  end_time: Timestamp;
  reason: string | null;
  created_by: string | null;
  created_at: Timestamp;
};

export type WaitlistRow = {
  id: string;
  client_id: string;
  service_id: string;
  staff_id: string | null;
  preferred_date: DateOnly;
  preferred_period: WaitlistPeriod;
  status: WaitlistStatus;
  notified_at: Timestamp | null;
  notes: string | null;
  created_at: Timestamp;
};

export type ReviewRow = {
  id: string;
  appointment_id: string;
  client_id: string | null;
  staff_id: string | null;
  rating: number;
  feedback: string | null;
  shared_to_google: boolean;
  published: boolean;
  created_at: Timestamp;
};

export type ClientNoteRow = {
  id: string;
  client_id: string;
  author_id: string | null;
  appointment_id: string | null;
  kind: NoteKind;
  content: string;
  formula: Json | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type OrderRow = {
  id: string;
  client_id: string | null;
  appointment_id: string | null;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  total: Money;
  stripe_checkout_session_id: string | null;
  paid_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: Money;
};

export type PaymentRow = {
  id: string;
  appointment_id: string | null;
  order_id: string | null;
  client_id: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: Money;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: Timestamp;
};

export type StripeEventRow = {
  id: string;
  type: string;
  processed_at: Timestamp;
};

export type LoyaltyRewardRow = {
  id: string;
  title: string;
  description: string | null;
  points_required: number;
  discount_type: DiscountType;
  discount_value: Money;
  active: boolean;
  created_at: Timestamp;
};

export type LoyaltyTransactionRow = {
  id: string;
  client_id: string;
  points: number;
  reason: string;
  appointment_id: string | null;
  reward_id: string | null;
  created_by: string | null;
  created_at: Timestamp;
};

export type LoyaltyRedemptionRow = {
  id: string;
  client_id: string;
  stamps: number;
  reward: string;
  status: "pending" | "approved" | "rejected";
  created_at: Timestamp;
  decided_at: Timestamp | null;
};

export type ManagerNoteRow = {
  id: string;
  content: string;
  pinned: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type IntegrationSecretsRow = {
  id: number;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_app_secret: string | null;
  whatsapp_verify_token: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  updated_at: Timestamp;
};

export type AdminEventRow = {
  id: number;
  type: AdminEventType;
  title: string;
  body: string | null;
  appointment_id: string | null;
  waitlist_id: string | null;
  payload: Json;
  read_at: Timestamp | null;
  created_at: Timestamp;
};

// Views
export type PublicStaffRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  calendar_color: string | null;
  service_ids: string[];
};

export type DailyRevenueRow = {
  day: DateOnly;
  services_revenue: Money;
  products_revenue: Money;
  tips: Money;
  appointments: number;
  total_revenue: Money;
};

export type StaffCommissionRow = {
  staff_id: string;
  staff_name: string;
  month: DateOnly;
  appointments: number;
  revenue: Money;
  tips: Money;
  commission_rate: number;
  commission: Money;
};

export type AvailableSlot = {
  staff_id: string;
  staff_name: string;
  slot_start: Timestamp;
  slot_end: Timestamp;
  discount_percent: number;
};

// ---------------------------------------------------------------------------
// Insert/Update derivados: colunas com default ou nullable ficam opcionais.
// ---------------------------------------------------------------------------
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];
type InsertOf<T, Defaults extends keyof T> = Optional<T, Defaults | NullableKeys<T>>;

type TableDef<Row, Defaults extends keyof Row, Rels = []> = {
  Row: Row;
  Insert: InsertOf<Row, Defaults>;
  Update: Partial<Row>;
  Relationships: Rels;
};

type ViewDef<Row> = { Row: Row; Relationships: [] };

/** FK no formato do gerador (nome default do Postgres: <tabela>_<coluna>_fkey). */
type FK<Table extends string, Col extends string, Ref extends string, OneToOne extends boolean = false> = {
  foreignKeyName: `${Table}_${Col}_fkey`;
  columns: [Col];
  isOneToOne: OneToOne;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type Database = {
  // necessário ao supabase-js ≥ 2.50 para inferir o dialeto do PostgREST
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      salon_settings: TableDef<
        SalonSettingsRow,
        | "id" | "name" | "timezone" | "currency" | "slot_interval_minutes" | "min_lead_minutes"
        | "booking_horizon_days" | "require_whatsapp_confirmation" | "deposit_percent" | "min_deposit" | "hold_minutes"
        | "cancellation_window_hours" | "loyalty_points_per_unit" | "updated_at"
        | "assistant_name" | "assistant_greeting" | "loyalty_stamps_required" | "loyalty_reward"
        | "auto_confirm_whatsapp" | "reminder_24h" | "birthday_message" | "ai_whatsapp_reply" | "telegram_notify"
      >;
      business_hours: TableDef<BusinessHoursRow, "is_closed">;
      profiles: TableDef<
        ProfileRow,
        | "id" | "role" | "loyalty_points" | "loyalty_code" | "marketing_opt_in" | "commission_rate"
        | "active" | "created_at" | "updated_at"
      >;
      staff_working_hours: TableDef<StaffWorkingHoursRow, "id", [FK<"staff_working_hours", "staff_id", "profiles">]>;
      services: TableDef<ServiceRow, "id" | "is_addon" | "sort_order" | "active" | "created_at" | "updated_at">;
      staff_services: TableDef<
        StaffServiceRow,
        never,
        [FK<"staff_services", "staff_id", "profiles">, FK<"staff_services", "service_id", "services">]
      >;
      products: TableDef<
        ProductRow,
        "id" | "stock" | "related_service_categories" | "active" | "created_at" | "updated_at"
      >;
      off_peak_discounts: TableDef<OffPeakDiscountRow, "id" | "active" | "created_at", [FK<"off_peak_discounts", "service_id", "services">]>;
      gallery_items: TableDef<
        GalleryItemRow,
        "id" | "sort_order" | "published" | "created_at",
        [FK<"gallery_items", "service_id", "services">, FK<"gallery_items", "staff_id", "profiles">]
      >;
      appointments: TableDef<
        AppointmentRow,
        | "id" | "code" | "status" | "source" | "total_price" | "discount_amount" | "deposit_amount"
        | "deposit_paid" | "tip_amount" | "created_at" | "updated_at",
        [
          FK<"appointments", "client_id", "profiles">,
          FK<"appointments", "staff_id", "profiles">,
          FK<"appointments", "service_id", "services">,
          FK<"appointments", "cancelled_by", "profiles">,
          FK<"appointments", "created_by", "profiles">,
        ]
      >;
      appointment_services: TableDef<
        AppointmentServiceRow,
        "position",
        [FK<"appointment_services", "appointment_id", "appointments">, FK<"appointment_services", "service_id", "services">]
      >;
      blocked_slots: TableDef<BlockedSlotRow, "id" | "created_at", [FK<"blocked_slots", "staff_id", "profiles">]>;
      waitlist: TableDef<
        WaitlistRow,
        "id" | "preferred_period" | "status" | "created_at",
        [
          FK<"waitlist", "client_id", "profiles">,
          FK<"waitlist", "service_id", "services">,
          FK<"waitlist", "staff_id", "profiles">,
        ]
      >;
      reviews: TableDef<
        ReviewRow,
        "id" | "shared_to_google" | "published" | "created_at",
        [
          FK<"reviews", "appointment_id", "appointments", true>,
          FK<"reviews", "client_id", "profiles">,
          FK<"reviews", "staff_id", "profiles">,
        ]
      >;
      client_notes: TableDef<
        ClientNoteRow,
        "id" | "kind" | "created_at" | "updated_at",
        [
          FK<"client_notes", "client_id", "profiles">,
          FK<"client_notes", "author_id", "profiles">,
          FK<"client_notes", "appointment_id", "appointments">,
        ]
      >;
      orders: TableDef<
        OrderRow,
        "id" | "status" | "fulfillment" | "total" | "created_at" | "updated_at",
        [FK<"orders", "client_id", "profiles">, FK<"orders", "appointment_id", "appointments">]
      >;
      order_items: TableDef<
        OrderItemRow,
        "id",
        [FK<"order_items", "order_id", "orders">, FK<"order_items", "product_id", "products">]
      >;
      payments: TableDef<
        PaymentRow,
        "id" | "status" | "method" | "currency" | "created_at",
        [
          FK<"payments", "appointment_id", "appointments">,
          FK<"payments", "order_id", "orders">,
          FK<"payments", "client_id", "profiles">,
        ]
      >;
      stripe_events: TableDef<StripeEventRow, "processed_at">;
      loyalty_rewards: TableDef<LoyaltyRewardRow, "id" | "discount_type" | "active" | "created_at">;
      loyalty_transactions: TableDef<
        LoyaltyTransactionRow,
        "id" | "created_at",
        [
          FK<"loyalty_transactions", "client_id", "profiles">,
          FK<"loyalty_transactions", "appointment_id", "appointments">,
          FK<"loyalty_transactions", "reward_id", "loyalty_rewards">,
        ]
      >;
      loyalty_redemptions: TableDef<
        LoyaltyRedemptionRow,
        "id" | "status" | "created_at",
        [FK<"loyalty_redemptions", "client_id", "profiles">]
      >;
      manager_notes: TableDef<ManagerNoteRow, "id" | "pinned" | "created_at" | "updated_at">;
      integration_secrets: TableDef<IntegrationSecretsRow, "id" | "updated_at">;
      admin_events: TableDef<
        AdminEventRow,
        "id" | "payload" | "created_at",
        [FK<"admin_events", "appointment_id", "appointments">, FK<"admin_events", "waitlist_id", "waitlist">]
      >;
    };
    Views: {
      public_staff: ViewDef<PublicStaffRow>;
      v_daily_revenue: ViewDef<DailyRevenueRow>;
      v_staff_commissions: ViewDef<StaffCommissionRow>;
    };
    Functions: {
      current_profile_id: { Args: never; Returns: string | null };
      is_staff: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      off_peak_discount: { Args: { p_start: string; p_service_ids: string[] }; Returns: number };
      get_available_slots: {
        Args: { p_date: DateOnly; p_service_ids: string[]; p_staff_id?: string | null; p_ignore_appointment?: string | null };
        Returns: AvailableSlot[];
      };
      get_month_availability: {
        Args: { p_from: DateOnly; p_to: DateOnly; p_service_ids: string[] };
        Returns: { day: DateOnly; free_slots: number; is_closed: boolean }[];
      };
      book_appointment: {
        Args: {
          p_service_ids: string[];
          p_start: string;
          p_staff_id?: string | null;
          p_client_id?: string | null;
          p_guest_name?: string | null;
          p_guest_phone?: string | null;
          p_source?: AppointmentSource;
          p_notes?: string | null;
        };
        Returns: AppointmentRow;
      };
      cancel_appointment: { Args: { p_id: string; p_reason?: string | null }; Returns: AppointmentRow };
      reschedule_appointment: {
        Args: { p_id: string; p_start: string; p_staff_id?: string | null };
        Returns: AppointmentRow;
      };
    };
    Enums: {
      user_role: UserRole;
      appointment_status: AppointmentStatus;
      appointment_source: AppointmentSource;
      service_category: ServiceCategory;
      waitlist_status: WaitlistStatus;
      waitlist_period: WaitlistPeriod;
      payment_kind: PaymentKind;
      payment_status: PaymentStatus;
      payment_method: PaymentMethod;
      order_status: OrderStatus;
      order_fulfillment: OrderFulfillment;
      discount_type: DiscountType;
      note_kind: NoteKind;
      admin_event_type: AdminEventType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// ---------------------------------------------------------------------------
// Atalhos
// ---------------------------------------------------------------------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

/** Códigos de erro lançados pelas funções RPC (vêm em error.message). */
export type BookingErrorCode =
  | "INVALID_SERVICES"
  | "CLIENT_REQUIRED"
  | "SLOT_UNAVAILABLE"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "INVALID_STATUS"
  | "CANCELLATION_WINDOW";

export const BOOKING_ERROR_MESSAGES: Record<BookingErrorCode, string> = {
  INVALID_SERVICES: "Um dos serviços escolhidos já não está disponível.",
  CLIENT_REQUIRED: "Precisamos do seu nome e contacto para concluir a marcação.",
  SLOT_UNAVAILABLE: "Esse horário acabou de ser ocupado. Escolha outro, por favor.",
  NOT_FOUND: "Agendamento não encontrado.",
  PERMISSION_DENIED: "Não tem permissão para esta ação.",
  INVALID_STATUS: "Este agendamento já não pode ser alterado.",
  CANCELLATION_WINDOW: "Já passou o prazo para alterar online. Contacte o salão, por favor.",
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Por confirmar",
  confirmed: "Confirmado",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Faltou",
};

export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  corte: "Cortes",
  coloracao: "Coloração",
  tratamento: "Tratamentos",
  penteado: "Penteados",
  barbearia: "Barbearia",
  unhas: "Unhas",
  sobrancelhas: "Sobrancelhas",
  estetica: "Estética",
};
