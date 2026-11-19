# Audit regression checks

Run from the repository root:

```powershell
dotnet run --project Staff-E-commerce-main/tests/AuditRegression/AuditRegression.csproj
node --test Staff-E-commerce-main/frontend/tests/auditDisplay.test.mjs
```

These checks do not connect to the application database. They cover the current mutation endpoint mappings, skipped hub/read-only requests, request-body replay, redaction, newly created and existing object identifiers, payment URL secrecy, partial/rolled-back imports, exception outcomes and unavailable audit storage. Frontend checks cover Vietnamese labels and legacy payloads.

Restart the backend after deployment. No database migration is required. Historical `CREATE_Unknown` entries remain unchanged because their original endpoint cannot be recovered from the stored payload.
