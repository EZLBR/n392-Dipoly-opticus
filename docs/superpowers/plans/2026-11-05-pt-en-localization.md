# Portuguese and English interface (#49)

- [x] Keep the language preference in the existing storage key. Centralize the presentation of API problem responses by type and HTTP status while preserving their raw details for diagnostics.
- [x] Move authentication, dashboards, Studio, account modals, storefront, cart and app-level copy into the dictionaries. Keep product and user-entered text as stored. Translate role and status labels at presentation, leaving their server values intact.
- [x] Verify language changes, preference restoration, and representative error states. Both suites, type checks and builds passed on this branch (115 frontend, 398 backend).
