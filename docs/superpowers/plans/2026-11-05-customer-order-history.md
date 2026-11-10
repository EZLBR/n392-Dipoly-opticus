# Customer order history (#52)

Implement on `feat/customer-order-history`, independently of Studio design permissions.

- [ ] Add integration coverage for own-order list and detail, bounded pagination, and cross-account access. Implement authenticated `GET /api/orders/mine` and `GET /api/orders/mine/:publicId`, scoped to the immutable order owner. Keep existing dashboard and payment routes as they are.
- [ ] Verify that the database records creation, status changes and transaction rollbacks. Add a Prisma migration with a baseline snapshot for existing orders and a trigger that writes events alongside the order change. Return chronological events in the detail response.
- [ ] Add the customer list and detail to `/orders`, with a client-only navigation entry, localized states, specifications and status timeline. Test loading, errors, empty lists and session changes. Keep order data in the current session's view memory.
- [ ] Run migrations in the isolated test database, full test suites, type checks and builds. Review the diff and validate the route locally.
