# RAW-SYNC-FIX wiki

- **Graph omits unselected fields.** `$select` without `parentReference` returns no
  `parentReference`. Any code that recognises an item by parent path must select it.
  Verified against the real API on 2026-11-19.
- **Fakes must be as strict as the real API.** The FakeDrive always returned
  `parentReference`, so the defensive-reconciliation tests passed while production deleted
  every synced record. The children listing in both fakes now honours `$select`.
- **Upload order is a contract.** The desktop acts as soon as a record lands, so the
  phone must upload media first and the record last.
- **A delta-based design can't recover something it dropped.** Once a device forgets a remote
  item that hasn't changed, the delta never sends it again. The raw/ listing is therefore also
  used to re-adopt records the device has lost.
