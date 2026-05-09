type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
};

type PreparedInvoice = {
  invoiceId: string;
  contractorId: string;
  contractorName: string;
  contactEmail: string;
  contactName: string;
  serviceType: string;
  serviceTypeId: number;
  billingMonth: string;
  dueDate: string;
};

const MONDAY_API_URL = "https://api.monday.com/v2";

const config = {
  apiToken: requiredEnv("MONDAY_API_TOKEN"),
  contractorsBoardId: env("MONDAY_CONTRACTORS_BOARD_ID", "18409241018"),
  invoicesBoardId: env("MONDAY_INVOICES_BOARD_ID", "18410126530"),
  invoicesGroupId: env("MONDAY_INVOICES_GROUP_ID", "group_title"),
  contractorStatusColumnId: env("MONDAY_CONTRACTOR_STATUS_COLUMN_ID", "color_mm2h3fpa"),
  contractorServicesColumnId: env("MONDAY_CONTRACTOR_SERVICES_COLUMN_ID", "dropdown_mm2h5m6n"),
  contractorEmailColumnId: env("MONDAY_CONTRACTOR_EMAIL_COLUMN_ID", "email_mm2hfwyv"),
  contractorContactColumnId: env("MONDAY_CONTRACTOR_CONTACT_COLUMN_ID", "text_mm2h8xrv"),
  invoiceStatusColumnId: env("MONDAY_INVOICE_STATUS_COLUMN_ID", "color_mm2q1nj"),
  invoiceStatusIndex: Number(env("MONDAY_INVOICE_STATUS_INDEX", "5")),
  invoiceDueDateColumnId: env("MONDAY_INVOICE_DUE_DATE_COLUMN_ID", "date_mm2qqq40"),
  invoiceServiceTypeColumnId: env("MONDAY_INVOICE_SERVICE_TYPE_COLUMN_ID", "dropdown_mm2qaf99"),
};

const slugMap: Record<string, string> = {
  HBCWS: "HBCWS",
  "Family Preservation": "FamilyPres",
  "Supervised Visitation": "Visitation",
  Transportation: "Transport",
  "Truancy Termination": "Truancy",
  CFTM: "CFTM",
  Court: "Court",
  Other: "Other",
};

const serviceIdMap: Record<string, number> = {
  Other: 1,
  Court: 2,
  CFTM: 3,
  "Truancy Termination": 4,
  Transportation: 5,
  "Supervised Visitation": 6,
  "Family Preservation": 7,
  HBCWS: 8,
};

async function main() {
  const runDate = new Date();
  const contractors = await getAllBoardItems(config.contractorsBoardId, [
    config.contractorStatusColumnId,
    config.contractorServicesColumnId,
    config.contractorEmailColumnId,
    config.contractorContactColumnId,
  ]);
  const existingInvoiceIds = new Set(
    (await getAllBoardItems(config.invoicesBoardId, [])).map((item) => item.name),
  );
  const invoices = prepareInvoices(contractors, runDate);

  if (invoices.length === 0) {
    console.log("No active contractors with services found.");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    if (existingInvoiceIds.has(invoice.invoiceId)) {
      skipped += 1;
      console.log(`Skipped existing invoice row: ${invoice.invoiceId}`);
      continue;
    }

    const createdItem = await createInvoiceItem(invoice);
    existingInvoiceIds.add(invoice.invoiceId);
    created += 1;
    console.log(`Created invoice row ${createdItem.id}: ${invoice.invoiceId}`);
  }

  console.log(`Monthly invoice row creation complete. Created: ${created}. Skipped: ${skipped}.`);
}

function prepareInvoices(contractors: MondayItem[], now: Date): PreparedInvoice[] {
  const monthName = now.toLocaleString("en", { month: "short", timeZone: "Africa/Lagos" });
  const lagosParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = valueFromDateParts(lagosParts, "year");
  const month = valueFromDateParts(lagosParts, "month");
  const billingMonth = `${year}-${month}-01`;
  const dueDate = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10);
  const shortYear = year.slice(-2);
  const invoices: PreparedInvoice[] = [];

  for (const item of contractors) {
    const statusCol = item.column_values.find((column) => column.id === config.contractorStatusColumnId);
    const servicesCol = item.column_values.find((column) => column.id === config.contractorServicesColumnId);
    const emailCol = item.column_values.find((column) => column.id === config.contractorEmailColumnId);
    const contactCol = item.column_values.find((column) => column.id === config.contractorContactColumnId);

    if (statusCol?.text !== "Active" || !servicesCol?.text) {
      continue;
    }

    const services = servicesCol.text
      .split(",")
      .map((service) => service.trim())
      .filter(Boolean);

    for (const service of services) {
      const slug = slugMap[service] ?? service.replace(/\s+/g, "").slice(0, 10);
      const contractorSlug = item.name.replace(/[^a-zA-Z0-9]/g, "");

      invoices.push({
        invoiceId: `${contractorSlug}-${slug}-${monthName}${shortYear}`,
        contractorId: item.id,
        contractorName: item.name,
        contactEmail: emailCol?.text ?? "",
        contactName: contactCol?.text ?? "",
        serviceType: service,
        serviceTypeId: serviceIdMap[service] ?? serviceIdMap.Other,
        billingMonth,
        dueDate,
      });
    }
  }

  return invoices;
}

async function getAllBoardItems(boardId: string, columnIds: string[]) {
  const firstPageQuery = `
    query GetBoardItems($boardIds: [ID!], $columnIds: [String!]) {
      boards(ids: $boardIds) {
        items_page(limit: 500) {
          cursor
          items {
            id
            name
            column_values(ids: $columnIds) {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  const firstPage = await mondayRequest<{
    boards: Array<{
      items_page: {
        cursor: string | null;
        items: MondayItem[];
      };
    }>;
  }>(firstPageQuery, {
    boardIds: [boardId],
    columnIds,
  });

  const page = firstPage.boards[0]?.items_page;
  const items = [...(page?.items ?? [])];
  let cursor = page?.cursor;

  const nextPageQuery = `
    query GetNextItemsPage($cursor: String!) {
      next_items_page(limit: 500, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
          }
        }
      }
    }
  `;

  while (cursor) {
    const nextPage = await mondayRequest<{
      next_items_page: {
        cursor: string | null;
        items: MondayItem[];
      };
    }>(nextPageQuery, { cursor });

    items.push(...nextPage.next_items_page.items);
    cursor = nextPage.next_items_page.cursor;
  }

  return items;
}

async function createInvoiceItem(invoice: PreparedInvoice) {
  const mutation = `
    mutation CreateInvoiceItem(
      $boardId: ID!
      $groupId: String!
      $itemName: String!
      $columnValues: JSON!
    ) {
      create_item(
        board_id: $boardId
        group_id: $groupId
        item_name: $itemName
        column_values: $columnValues
      ) {
        id
        name
      }
    }
  `;

  const columnValues = {
    [config.invoiceStatusColumnId]: { index: config.invoiceStatusIndex },
    [config.invoiceDueDateColumnId]: { date: invoice.dueDate },
    [config.invoiceServiceTypeColumnId]: { ids: [invoice.serviceTypeId] },
  };

  const result = await mondayRequest<{
    create_item: {
      id: string;
      name: string;
    };
  }>(mutation, {
    boardId: config.invoicesBoardId,
    groupId: config.invoicesGroupId,
    itemName: invoice.invoiceId,
    columnValues: JSON.stringify(columnValues),
  });

  return result.create_item;
}

async function mondayRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(
      `Monday API request failed: ${payload.errors?.map((error) => error.message).join("; ") ?? response.statusText}`,
    );
  }

  return payload.data;
}

function env(name: string, defaultValue: string) {
  return process.env[name] || defaultValue;
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function valueFromDateParts(parts: Intl.DateTimeFormatPart[], type: string) {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Could not derive ${type} for invoice period.`);
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
