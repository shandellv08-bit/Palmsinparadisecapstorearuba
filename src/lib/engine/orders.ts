/** Order rules. Mirrors order_transition_allowed() in 0003_functions.sql. */

export const ORDER_STATUSES = ["new", "confirmed", "ready", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ["confirmed", "ready", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Next steps a staff member can take, excluding cancel (which has its own flow). */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from].filter((s) => s !== "cancelled");
}

export function canCancel(status: OrderStatus): boolean {
  return TRANSITIONS[status].includes("cancelled");
}

export function formatOrderNumber(n: number | string): string {
  return `PIP-${n}`;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Turns a database error from place_order() into words a customer understands. */
export function checkoutErrorMessage(code: string | undefined): string {
  switch (code) {
    case "out_of_stock":
      return "One of the caps in your order has just sold out in that size. Remove it and try again.";
    case "unavailable":
      return "One of the caps in your order is no longer available. Remove it and try again.";
    case "delivery_unavailable":
      return "Delivery is not available right now. Choose pickup instead.";
    case "pickup_unavailable":
      return "Pickup is not available right now.";
    case "invalid_phone":
      return "Enter a phone number with at least 7 digits.";
    case "invalid_email":
      return "That email address does not look right.";
    case "invalid_address":
      return "Enter a delivery address.";
    case "invalid_name":
      return "Enter your name.";
    case "too_many_orders":
      return "You have placed several orders in the last hour. Contact us and we will help.";
    case "invalid_items":
      return "Your order has an item we could not read. Remove it and try again.";
    default:
      return "Your order could not be placed. Nothing was charged. Try again in a moment.";
  }
}
