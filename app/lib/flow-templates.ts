export type FlowBlock = {
  id: string;
  type:
    | "TextHeading"
    | "TextSubheading"
    | "TextBody"
    | "TextCaption"
    | "TextInput"
    | "TextArea"
    | "Dropdown"
    | "RadioButtonsGroup"
    | "CheckboxGroup"
    | "CalendarPicker"
    | "OptIn";
  text?: string;
  label?: string;
  name?: string;
  required?: boolean;
  inputType?: "text" | "email" | "phone" | "number";
  options?: Array<{ id: string; title: string }>;
};

export type FlowTemplate = {
  key: string;
  name: string;
  description: string;
  definition: {
    version: "7.3";
    dynamicBooking?: boolean;
    screens: Array<{
      id: string;
      title: string;
      final: true;
      text: string;
      buttonText: string;
      next: null;
      blocks: FlowBlock[];
    }>;
  };
  mapping: {
    contact?: { nameField?: string; emailField?: string };
    customFields?: Record<string, string>;
  };
  dynamic?: boolean;
  unavailableReason?: string;
};

const screen = (
  title: string,
  text: string,
  buttonText: string,
  blocks: FlowBlock[],
) => ({
  version: "7.3" as const,
  screens: [
    {
      id: crypto.randomUUID(),
      title,
      final: true as const,
      text,
      buttonText,
      next: null,
      blocks,
    },
  ],
});

const body = (id: string, text: string): FlowBlock => ({ id, type: "TextBody", text });
const input = (
  id: string,
  name: string,
  label: string,
  inputType: FlowBlock["inputType"] = "text",
  required = true,
): FlowBlock => ({ id, type: "TextInput", name, label, inputType, required });
const choices = (
  id: string,
  type: "Dropdown" | "RadioButtonsGroup" | "CheckboxGroup",
  name: string,
  label: string,
  options: Array<[string, string]>,
  required = true,
): FlowBlock => ({
  id,
  type,
  name,
  label,
  required,
  options: options.map(([optionId, title]) => ({ id: optionId, title })),
});

/** Catálogo restaurado do SmartZap original, convertido ao editor atual. */
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: "feedback_v1",
    name: "Feedback simples",
    description: "Avaliação rápida com escolha única e comentário opcional.",
    definition: screen("Feedback", "Você recomendaria a gente para um amigo?", "Enviar", [
      body("feedback_intro", "Você recomendaria a gente para um amigo?"),
      choices("feedback_recommend", "RadioButtonsGroup", "recommend", "Escolha uma opção", [["yes", "Sim"], ["no", "Não"]]),
      { id: "feedback_comment", type: "TextArea", name: "comment", label: "Como podemos melhorar? (opcional)", required: false },
    ]),
    mapping: { customFields: { feedback_recommend: "recommend", feedback_comment: "comment" } },
  },
  {
    key: "lead_interest_v1",
    name: "Interesse de compra",
    description: "Coleta nome, telefone e interesse principal.",
    definition: screen("Interesse", "Conte pra gente o que você procura.", "Continuar", [
      body("interest_intro", "Conte pra gente o que você procura."),
      input("interest_name", "full_name", "Nome"),
      input("interest_phone", "phone", "Telefone", "phone"),
      choices("interest_type", "Dropdown", "interest", "Interesse", [["produtos", "Produtos"], ["servicos", "Serviços"], ["planos", "Planos"], ["outros", "Outros"]]),
    ]),
    mapping: { contact: { nameField: "full_name" }, customFields: { lead_phone: "phone", lead_interest: "interest" } },
  },
  {
    key: "support_request_v1",
    name: "Suporte ao cliente",
    description: "Coleta assunto, prioridade e descrição do problema.",
    definition: screen("Suporte", "Vamos entender seu problema para ajudar mais rápido.", "Enviar", [
      body("support_intro", "Vamos entender seu problema para ajudar mais rápido."),
      choices("support_topic", "Dropdown", "topic", "Assunto", [["pagamento", "Pagamento"], ["entrega", "Entrega"], ["acesso", "Acesso"], ["outros", "Outros"]]),
      choices("support_priority", "RadioButtonsGroup", "priority", "Prioridade", [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]]),
      { id: "support_details", type: "TextArea", name: "details", label: "Descreva o problema", required: true },
    ]),
    mapping: { customFields: { support_topic: "topic", support_priority: "priority", support_details: "details" } },
  },
  {
    key: "pesquisa_rapida_v1",
    name: "Pesquisa rápida",
    description: "Múltipla escolha e observações finais.",
    definition: screen("Pesquisa", "Ajude a melhorar nossa experiência.", "Enviar", [
      body("survey_intro", "Ajude a melhorar nossa experiência."),
      choices("survey_topics", "CheckboxGroup", "topics", "Quais temas você gostaria de ver?", [["novidades", "Novidades"], ["descontos", "Descontos"], ["tutorials", "Tutoriais"], ["eventos", "Eventos"]], false),
      { id: "survey_notes", type: "TextArea", name: "notes", label: "Comentários finais (opcional)", required: false },
    ]),
    mapping: { customFields: { survey_topics: "topics", survey_notes: "notes" } },
  },
  {
    key: "lead_cadastro_v1",
    name: "Lead / Cadastro",
    description: "Coleta nome, e-mail, interesse e opt-in.",
    definition: screen("Cadastro", "Vamos te cadastrar rapidinho.", "Enviar", [
      body("lead_intro", "Vamos te cadastrar rapidinho. Preencha os dados abaixo:"),
      input("lead_name", "lead_name", "Nome"),
      input("lead_email", "lead_email", "E-mail", "email"),
      choices("lead_interest", "Dropdown", "lead_interest", "Qual seu interesse?", [["produto", "Produto"], ["servico", "Serviço"], ["orcamento", "Orçamento"], ["outro", "Outro"]], false),
      { id: "lead_optin", type: "OptIn", name: "lead_optin", text: "Quero receber mensagens sobre novidades e promoções." },
    ]),
    mapping: { contact: { nameField: "lead_name", emailField: "lead_email" }, customFields: { lead_interest: "lead_interest", lead_optin: "lead_optin" } },
  },
  {
    key: "agendamento_v1",
    name: "Agendamento",
    description: "Coleta serviço, data, horário e observações.",
    definition: screen("Agendamento", "Escolha as opções abaixo para solicitar um agendamento.", "Solicitar agendamento", [
      body("booking_intro", "Escolha as opções abaixo para solicitar um agendamento."),
      choices("booking_service", "Dropdown", "service", "Serviço", [["consulta", "Consulta"], ["visita", "Visita"], ["suporte", "Suporte"]]),
      { id: "booking_date", type: "CalendarPicker", name: "date", label: "Data", required: true },
      choices("booking_time", "Dropdown", "time", "Horário", [["09:00", "09:00"], ["10:00", "10:00"], ["11:00", "11:00"], ["14:00", "14:00"], ["15:00", "15:00"], ["16:00", "16:00"]]),
      { id: "booking_notes", type: "TextArea", name: "notes", label: "Observações (opcional)", required: false },
    ]),
    mapping: { customFields: { appointment_service: "service", appointment_date: "date", appointment_time: "time", appointment_notes: "notes" } },
  },
  {
    key: "pesquisa_nps_v1",
    name: "Pesquisa / NPS",
    description: "Coleta score NPS de 0 a 10 e comentário opcional.",
    definition: screen("Pesquisa", "De 0 a 10, o quanto você recomendaria a gente?", "Enviar pesquisa", [
      body("nps_intro", "De 0 a 10, o quanto você recomendaria a gente para um amigo?"),
      choices("nps_score", "RadioButtonsGroup", "nps_score", "Nota", Array.from({ length: 11 }, (_, value) => [String(value), String(value)])),
      { id: "nps_comment", type: "TextArea", name: "nps_comment", label: "Quer contar o motivo? (opcional)", required: false },
    ]),
    mapping: { customFields: { nps_score: "nps_score", nps_comment: "nps_comment" } },
  },
  {
    key: "agendamento_dinamico_v1",
    name: "Agendamento (Google Calendar)",
    description: "Horários em tempo real com Google Calendar.",
    dynamic: true,
    definition: { ...screen("Agendamento dinâmico", "Escolha serviço, data e horário disponíveis em tempo real.", "Configurar agenda", [
      body("calendar_booking", "Este MiniApp consulta sua agenda Google e confirma o horário selecionado."),
    ]),
      dynamicBooking: true,
    },
    mapping: { customFields: { booking_notes: "notes" } },
  },
];
