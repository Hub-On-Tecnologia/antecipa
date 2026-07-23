# Security Specification - Promised Commissions

## Data Invariants
1. A promised commission must have a valid PV ID matching the spreadsheet.
2. A user can only see and create promised commissions linked to their own CPF.
3. The amount must be a positive number.
4. Timestamps must be handled by the server (requestedAt).

## The Dirty Dozen (Potential Attacks)
1. **Identity Theft**: User A tries to read Promised Commissions of User B by querying with User B's CPF.
2. **Amount Poisoning**: User tries to save a negative amount to "add" balance.
3. **Ghost Fields**: Adding `isVerified: true` to bypass verification.
4. **PV Hijacking**: User A tries to advance a PV that belongs to User B.
5. **Timestamp Spoofing**: Sending an old `requestedAt` to manipulate records.
6. **Self-Approval**: User tries to update status to "approved" manually.
7. **Large ID**: Sending a 1MB string as commissionId.
8. **Shadow Keys**: Adding extra keys to the document to store unauthorized metadata.
9. **Relational Orphan**: Creating a promise for a PV that doesn't exist in the sheets (harder to check in rules without cloud functions, but we can limit by CPF).
10. **Duplicate Write**: Writing the same promise twice with different IDs to bypass client-side checks.
11. **Mass Extraction**: Trying to list all collection without filtering by CPF.
12. **Type Confusion**: Sending `amount` as a string instead of a number.

## Test Cases (Expected Denials)
- `create` with `userCpf != auth.token.cpf` (assuming we store CPF in extra claims or we just match the one they logged in with? Wait, we only have Google Login).
- Actually, we'll use `auth.uid` or `auth.token.email`. The user is identified by email in our system currently.

Wait, I should use `request.auth.token.email` or `request.auth.uid`.
I'll use `auth.uid` for security and link documents to `userId`.
The user's email is available in `request.auth.token.email`.

Let's refine:
- `ownerId` field in document = `request.auth.uid`.
