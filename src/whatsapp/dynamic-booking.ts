import { availableDates, availableSlots, createCalendarEvent, getBookingConfig } from "../integrations/google-calendar";
import type { FlowEndpointRequest } from "./flow-endpoint";

/** Contrato Meta v7.3 para o MiniApp de agenda dinâmica. */
export function dynamicBookingFlowJson(dataApiVersion: "3.0" | "4.0" = "3.0"): Record<string, unknown> {
  return {
    version: "7.3",
    data_api_version: dataApiVersion,
    routing_model: {
      BOOKING_START: ["SELECT_TIME"],
      SELECT_TIME: ["CUSTOMER_INFO"],
      CUSTOMER_INFO: [],
    },
    screens: [
      {
        id: "BOOKING_START", title: "${data.title}",
        data: {
          title: { type: "string", __example__: "Agendar atendimento" }, subtitle: { type: "string", __example__: "Escolha o serviço e a data" }, error_message: { type: "string", __example__: "" },
          services: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } }, __example__: [{ id: "consulta", title: "Consulta" }] },
          dates: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } }, __example__: [{ id: "2026-07-15", title: "15 jul." }] },
        },
        layout: { type: "SingleColumnLayout", children: [{ type: "Form", name: "booking_form", children: [
          { type: "TextSubheading", text: "${data.subtitle}" },
          { type: "Dropdown", name: "selected_service", label: "Tipo de atendimento", required: true, "data-source": "${data.services}" },
          { type: "Dropdown", name: "selected_date", label: "Data", required: true, "data-source": "${data.dates}" },
          { type: "TextCaption", text: "${data.error_message}", visible: "${data.error_message}" },
          { type: "Footer", label: "Ver horários", "on-click-action": { name: "data_exchange", payload: { selected_service: "${form.selected_service}", selected_date: "${form.selected_date}" } } },
        ] }] },
      },
      {
        id: "SELECT_TIME", title: "${data.title}", refresh_on_back: true,
        data: {
          title: { type: "string", __example__: "Escolha o horário" }, subtitle: { type: "string", __example__: "Horários disponíveis" }, selected_service: { type: "string", __example__: "consulta" }, selected_date: { type: "string", __example__: "2026-07-15" },
          slots: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } }, __example__: [{ id: "2026-07-15T12:00:00.000Z", title: "09:00" }] },
        },
        layout: { type: "SingleColumnLayout", children: [{ type: "Form", name: "time_form", children: [
          { type: "TextSubheading", text: "${data.subtitle}" },
          { type: "Dropdown", name: "selected_slot", label: "Horário", required: true, "data-source": "${data.slots}" },
          { type: "Footer", label: "Continuar", "on-click-action": { name: "data_exchange", payload: { selected_service: "${data.selected_service}", selected_date: "${data.selected_date}", selected_slot: "${form.selected_slot}" } } },
        ] }] },
      },
      {
        id: "CUSTOMER_INFO", title: "${data.title}",
        data: { title: { type: "string", __example__: "Seus dados" }, subtitle: { type: "string", __example__: "Confirme para agendar" }, selected_service: { type: "string", __example__: "consulta" }, selected_date: { type: "string", __example__: "2026-07-15" }, selected_slot: { type: "string", __example__: "2026-07-15T12:00:00.000Z" } },
        layout: { type: "SingleColumnLayout", children: [{ type: "Form", name: "customer_form", children: [
          { type: "TextSubheading", text: "${data.subtitle}" },
          { type: "TextInput", name: "customer_name", label: "Seu nome", required: true, "input-type": "text" },
          { type: "TextInput", name: "customer_phone", label: "Telefone (opcional)", required: false, "input-type": "phone" },
          { type: "TextArea", name: "notes", label: "Observações", required: false },
          { type: "Footer", label: "Confirmar agendamento", "on-click-action": { name: "data_exchange", payload: { selected_service: "${data.selected_service}", selected_date: "${data.selected_date}", selected_slot: "${data.selected_slot}", customer_name: "${form.customer_name}", customer_phone: "${form.customer_phone}", notes: "${form.notes}" } } },
        ] }] },
      },
    ],
  };
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export async function handleDynamicBookingRequest(env: Env, db: D1Database, request: FlowEndpointRequest): Promise<Record<string, unknown>> {
  const config = await getBookingConfig(db);
  if (request.action === "ping") return { data: { status: "active" } };
  if (request.action === "INIT") return {
    screen: "BOOKING_START",
    data: { title: "Agendar atendimento", subtitle: "Escolha o serviço e a data", services: config.services.map(({ id, title }) => ({ id, title })), dates: await availableDates(db), error_message: "" },
  };
  if (request.action === "BACK") {
    if (request.screen === "SELECT_TIME") return handleDynamicBookingRequest(env, db, { ...request, action: "INIT" });
    return { screen: "SELECT_TIME", data: request.data ?? {} };
  }
  if (request.action !== "data_exchange") throw new Error("Ação de agenda inválida");
  const data = request.data ?? {};
  if (request.screen === "BOOKING_START") {
    const selectedDate = text(data.selected_date);
    const selectedService = text(data.selected_service);
    if (!selectedDate || !config.services.some((service) => service.id === selectedService)) throw new Error("Selecione serviço e data");
    const slots = await availableSlots(env, db, selectedDate);
    if (!slots.length) return { screen: "BOOKING_START", data: { title: "Agendar atendimento", subtitle: "Escolha o serviço e a data", services: config.services.map(({ id, title }) => ({ id, title })), dates: await availableDates(db), error_message: "Não há horários disponíveis nesta data." } };
    return { screen: "SELECT_TIME", data: { title: "Escolha o horário", subtitle: "Horários disponíveis", selected_service: selectedService, selected_date: selectedDate, slots } };
  }
  if (request.screen === "SELECT_TIME") {
    const slot = text(data.selected_slot);
    if (!slot) throw new Error("Selecione um horário");
    return { screen: "CUSTOMER_INFO", data: { title: "Seus dados", subtitle: "Confirme para agendar", selected_service: text(data.selected_service), selected_date: text(data.selected_date), selected_slot: slot } };
  }
  if (request.screen === "CUSTOMER_INFO") {
    const customerName = text(data.customer_name);
    const selectedService = text(data.selected_service);
    const selectedSlot = text(data.selected_slot);
    if (!customerName || !selectedService || !selectedSlot) throw new Error("Preencha os dados obrigatórios");
    const event = await createCalendarEvent(env, db, {
      slot: selectedSlot,
      service: selectedService,
      customerName,
      customerPhone: text(data.customer_phone),
      notes: text(data.notes),
      idempotencyKey: request.flow_token,
    });
    return {
      screen: "SUCCESS",
      data: {
        extension_message_response: {
          params: {
            flow_token: request.flow_token,
            event_id: event.id,
            status: "confirmed",
            selected_service: selectedService,
            selected_date: text(data.selected_date),
            selected_slot: selectedSlot,
            customer_name: customerName,
            customer_phone: text(data.customer_phone),
            notes: text(data.notes),
          },
        },
      },
    };
  }
  throw new Error("Tela de agenda inválida");
}
