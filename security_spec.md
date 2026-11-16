# Security Specification: Accident Alert Emergency Reporting System

## Phase 0: Security Invariants and Threat Modeling

### 1. Data Invariants
- **Public Emergency Ingestion**: Any citizen/bystander (including unauthenticated emergency reporters) can submit a new accident report to ensure live-saving assistance is never blocked by login friction in life-or-death situations.
- **Accident Report Immutability**: The core reporting details (`reportId`, `createdAt`, `latitude`, `longitude`, `photoUrl`) cannot be altered once created.
- **Triage & Status Control**: Status transitions (`Pending`, `In Progress`, `Resolved`) and priority changes can be updated by responding dispatchers or authorized staff.
- **Deletion Protection**: Deleting accident records requires administrative confirmation or owner privileges; records cannot be arbitrarily wiped out.
- **Size Limits & Anti-Denial-of-Service**: Max limits on string lengths (address <= 500 chars, message <= 2000 chars, photo payload bounds) to prevent database flooding attacks.
- **Terminal State Guarding**: Once an incident is marked 'Resolved', only authorized dispatchers or admins can reopen or amend records.

### 2. The "Dirty Dozen" Payloads
1. **Malicious Giant Payload**: An accident report with a 50MB string injected into `emergencyMessage`.
2. **Missing Invariant Fields**: An accident report without `latitude`, `longitude`, or `reportId`.
3. **Invalid ID Path**: Document created with junk path characters like `../..` or 2000 random Unicode symbols.
4. **Status Short-Circuit**: Attempting to set an invalid status like `status: "Deleted_By_Hacker"`.
5. **Priority Poisoning**: Injecting an invalid priority `priority: "Extraterrestrial"`.
6. **Shadow Fields Injection**: Adding ghost privilege attributes like `isAdmin: true` or `grantPermissions: ["root"]` into the accident document.
7. **Timestamp Spoofing**: Sending future or negative past dates in timestamp fields.
8. **Unauthorized Mass Delete**: An anonymous user attempting to purge all existing accident reports.
9. **Admin Collection Tampering**: An unauthenticated user writing to `/admins/{uid}` to grant themselves dispatcher rights.
10. **Corrupted Coordinate Injection**: Submitting `latitude: "NOT_A_NUMBER"` or coordinates outside Earth's valid range (-90 to 90 lat, -180 to 180 lng).
11. **Altering Immutable Original Report**: Overwriting original `photoUrl` or GPS coordinates after emergency units have already been dispatched.
12. **PII Scraping**: Blanket unauthenticated reading of admin personnel credentials and contact info.

### 3. Defensive Blueprint
All rules enforce:
- `isValidId(id)` validation on document paths.
- Default deny fallback `match /{document=**} { allow read, write: if false; }`.
- Specific `isValidAccidentReport(incoming)` on creation and updates.
- Field diffing via `.affectedKeys().hasOnly(...)`.
