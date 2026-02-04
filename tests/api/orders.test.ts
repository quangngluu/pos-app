import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST as createOrder } from "@/app/api/orders/route";
import { GET as getOrderByCode, PATCH as updateOrderStatus } from "@/app/api/orders/[order_code]/route";

const requireUserMock = vi.hoisted(() => vi.fn());
const supabaseMock = vi.hoisted(() => ({ from: vi.fn() })) as any;
const quoteOrderMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/requireAuth", () => ({ requireUser: requireUserMock }));
vi.mock("@/app/lib/supabaseAdmin", () => ({ supabaseAdmin: supabaseMock }));
vi.mock("@/app/lib/pricingEngine", () => ({ quoteOrder: quoteOrderMock }));

function makeCustomerTable(opts: {
  lookup: { data: any | null; error: any };
  insert: { data: any; error: any };
}) {
  const table: any = {
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    maybeSingle: vi.fn(() => Promise.resolve(opts.lookup)),
    insert: vi.fn((_payload: any) => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve(opts.insert)),
      })),
    })),
  };
  return table;
}

function makeOrdersInsertTable(orderInsert: { data: any; error: any }) {
  const insert = vi.fn((payload: any) => ({
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(orderInsert)),
    })),
  }));
  return { insert };
}

function makeOrderLinesInsertTable(result: { error: any } = { error: null }) {
  return {
    insert: vi.fn(async () => result),
  };
}

function makePromotionsInsertTable(result: { error: any } = { error: null }) {
  return {
    insert: vi.fn(async () => result),
  };
}

function makeOrderFetchTable(result: { data: any | null; error: any }) {
  const table: any = {
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return table;
}

function makeOrderLinesFetchTable(result: { data: any[] | null; error: any }) {
  const table: any = {
    select: vi.fn(() => table),
    eq: vi.fn(() => Promise.resolve(result)),
  };
  return table;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockReset();
  requireUserMock.mockReset();
  quoteOrderMock.mockReset();
});

describe("POST /api/orders", () => {
  it("creates an order and returns order_code", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    quoteOrderMock.mockResolvedValue({
      ok: true,
      totals: {
        subtotal_before: 10000,
        discount_total: 0,
        grand_total: 10000,
      },
      lines: [
        {
          line_id: "550e8400-e29b-41d4-a716-446655440000",
          unit_price_after: 10000,
          line_total_after: 10000,
          missing_price: false,
        },
      ],
    });

    const customerTable = makeCustomerTable({
      lookup: { data: null, error: null },
      insert: { data: { id: "cust-1" }, error: null },
    });
    const ordersTable = makeOrdersInsertTable({
      data: { id: "order-1", order_code: "OC123", created_at: "2024-01-01T00:00:00Z" },
      error: null,
    });
    const orderLinesTable = makeOrderLinesInsertTable();
    const promotionsTable = makePromotionsInsertTable();

    supabaseMock.from.mockImplementation((table: string) => {
      switch (table) {
        case "customers":
          return customerTable;
        case "orders":
          return ordersTable;
        case "order_lines":
          return orderLinesTable;
        case "order_applied_promotions":
          return promotionsTable;
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });

    const payload = {
      phone: "0901234567",
      customer_name: "Alice",
      default_address: "123 Street",
      addr_selected: null,
      note: "No ice",
      delivery_time: "",
      platform: "web",
      store_id: null,
      store_name: "",
      promotion_code: null,
      shipping: { fee: 0, discount: 0, free: false },
      lines: [
        {
          line_id: "550e8400-e29b-41d4-a716-446655440000",
          product_id: "prod-1",
          qty: 1,
          display_size: "SIZE_LA",
          price_key: "SIZE_LA",
          sugar_value_code: "SWEET",
          product_name_snapshot: "Latte",
          note: "",
        },
      ],
    };

    const req = new Request("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const res = await createOrder(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.order.order_code).toBe("OC123");
    expect(ordersTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: "user-1", total: 10000 })
    );
    expect(orderLinesTable.insert).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/orders/[order_code]", () => {
  it("returns an order for the authenticated owner", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    const orderFetchTable = makeOrderFetchTable({
      data: {
        id: "order-1",
        order_code: "OC123",
        status: "PLACED",
        total: 15000,
        subtotal: 14000,
        discount_total: 1000,
        created_at: "2024-01-01T00:00:00Z",
        items: null,
      },
      error: null,
    });

    const orderLinesFetchTable = makeOrderLinesFetchTable({
      data: [
        {
          product_id: "prod-1",
          product_name_snapshot: "Latte",
          price_key_snapshot: "SIZE_LA",
          unit_price_snapshot: 14000,
          qty: 1,
          options_snapshot: {},
          line_total: 14000,
          note: null,
        },
      ],
      error: null,
    });

    supabaseMock.from.mockImplementation((table: string) => {
      switch (table) {
        case "orders":
          return orderFetchTable;
        case "order_lines":
          return orderLinesFetchTable;
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });

    const res = await getOrderByCode(
      new Request("http://localhost/api/orders/OC123"),
      { params: Promise.resolve({ order_code: "OC123" }) }
    );

    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.order.order_code).toBe("OC123");
    expect(json.order.lines).toHaveLength(1);
  });

  it("returns 404 when order is missing or not owned", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    const orderFetchTable = makeOrderFetchTable({ data: null, error: null });
    const orderLinesFetchTable = makeOrderLinesFetchTable({ data: [], error: null });

    supabaseMock.from.mockImplementation((table: string) => {
      switch (table) {
        case "orders":
          return orderFetchTable;
        case "order_lines":
          return orderLinesFetchTable;
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });

    const res = await getOrderByCode(
      new Request("http://localhost/api/orders/OC404"),
      { params: Promise.resolve({ order_code: "OC404" }) }
    );

    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Order not found");
  });
});

describe("PATCH /api/orders/[order_code]", () => {
  function makeOrderUpdateTable(fetchResult: { data: any | null; error: any }, updateResult: { error: any } = { error: null }) {
    const table: any = {
      select: vi.fn(() => table),
      eq: vi.fn(() => table),
      maybeSingle: vi.fn(() => Promise.resolve(fetchResult)),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(updateResult)),
      })),
    };
    return table;
  }

  it("updates order status with valid transition", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    const ordersTable = makeOrderUpdateTable({
      data: { id: "order-1", order_code: "OC123", status: "PLACED" },
      error: null,
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "orders") return ordersTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const res = await updateOrderStatus(
      new Request("http://localhost/api/orders/OC123", {
        method: "PATCH",
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ order_code: "OC123" }) }
    );

    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.order.status).toBe("CONFIRMED");
    expect(json.order.previous_status).toBe("PLACED");
  });

  it("rejects invalid status transition", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    const ordersTable = makeOrderUpdateTable({
      data: { id: "order-1", order_code: "OC123", status: "COMPLETED" },
      error: null,
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "orders") return ordersTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const res = await updateOrderStatus(
      new Request("http://localhost/api/orders/OC123", {
        method: "PATCH",
        body: JSON.stringify({ status: "PLACED" }),
      }),
      { params: Promise.resolve({ order_code: "OC123" }) }
    );

    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Invalid status transition");
  });

  it("allows cancellation from non-terminal state", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    const ordersTable = makeOrderUpdateTable({
      data: { id: "order-1", order_code: "OC123", status: "SHIPPING" },
      error: null,
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "orders") return ordersTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const res = await updateOrderStatus(
      new Request("http://localhost/api/orders/OC123", {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" }),
      }),
      { params: Promise.resolve({ order_code: "OC123" }) }
    );

    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.order.status).toBe("CANCELLED");
  });

  it("returns 404 for non-existent order", async () => {
    requireUserMock.mockResolvedValue({ ok: true, user: { id: "user-1" } });

    const ordersTable = makeOrderUpdateTable({ data: null, error: null });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "orders") return ordersTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const res = await updateOrderStatus(
      new Request("http://localhost/api/orders/OC404", {
        method: "PATCH",
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ order_code: "OC404" }) }
    );

    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Order not found");
  });
});
