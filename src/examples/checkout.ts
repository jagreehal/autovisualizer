import { createMachine } from "xstate"

// v6 guards are plain `if`s inside transition functions. The visualizer reads the
// literal targets out of them (dashed, numbered edges).
export const checkoutMachine = createMachine({
  id: "checkout",
  initial: "idle",
  context: { items: 0, attempts: 0 },
  states: {
    idle: {
      on: { ADD_ITEM: ({ context }) => ({ target: "cart", context: { ...context, items: context.items + 1 } }) }
    },
    cart: {
      on: {
        CHECKOUT: { target: "address" },
        EMPTY: { target: "idle" },
        CANCEL: { target: "idle" }
      }
    },
    address: {
      on: { SUBMIT: { target: "payment" } }
    },
    payment: {
      on: {
        PAID: { target: "confirmed" },
        FAIL: ({ context }) => {
          if (context.attempts >= 2) return { target: "declined", context: { ...context, attempts: 0 } }
          return { target: "payment", context: { ...context, attempts: context.attempts + 1 } }
        }
      }
    },
    declined: {
      on: { RETRY: { target: "payment" }, CANCEL: { target: "cart" } }
    },
    // Nothing transitions here: shows up as unreachable.
    refund: {},
    confirmed: { type: "final" }
  }
})
