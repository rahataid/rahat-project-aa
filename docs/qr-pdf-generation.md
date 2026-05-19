# Beneficiary QR PDF Generation

Generates A4 PDFs containing ID cards for all beneficiaries in a group. Each card shows a QR code (encoding the beneficiary's wallet address), Name, Phone, and OTP code. Designed to handle up to 10,000 beneficiaries using async queue processing and Cloudflare R2 storage.

## Card Layout

- **Page size:** A4 (595 × 842 pt)
- **Cards per page:** 6 (3 columns × 2 rows)
- **Each card contains:**
  - QR code of `walletAddress`
  - Name (from `extras.name` or `extras.firstName + extras.lastName`)
  - Phone (bold)
  - OTP code from `tbl_otp` (empty if not set)

## Architecture

```
Client
  │
  ├─▶ GENERATE_QR_PDF { groupId }
  │     ├─ Check for pending/processing job for this group
  │     │   └─ If found → return existing jobId (alreadyRunning: true)
  │     └─ Create PdfGenerationJob (status: pending)
  │         └─ Enqueue Bull job → return jobId (alreadyRunning: false)
  │
  └─▶ GET_QR_PDF_JOB { jobId }   ← poll until completed
        └─ Returns { status, fileUrl?, error? }

Bull Queue (QR_PDF_<PROJECT_ID>)
  └─ PdfGenerationProcessor
       └─ QrPdfService.processQrPdf()
            ├─ status → processing
            ├─ Fetch beneficiaries in batches of 200 (Prisma, no microservice)
            ├─ Bulk-fetch OTPs by walletAddress per batch
            ├─ Build card data: { walletAddress, name, phone, otp }
            ├─ Generate PDF (PDFKit + qrcode)
            ├─ Upload to Cloudflare R2
            └─ status → completed, fileUrl = R2 URL
```

## New Files

| File | Purpose |
|---|---|
| `apps/aa/src/beneficiary/qr-pdf-builder.ts` | Pure PDF builder utility (PDFKit + qrcode) |
| `apps/aa/src/beneficiary/qr-pdf.service.ts` | Job lifecycle, deduplication, batched data fetch, R2 upload |
| `apps/aa/src/processors/pdf-generation.processor.ts` | Bull queue processor |

## Message Patterns

### Trigger PDF generation

```json
{
  "cmd": "aa.jobs.beneficiary.generateQrPdf",
  "uuid": "<PROJECT_ID>"
}
```

**Payload:**
```json
{ "groupId": "<group-uuid>" }
```

**Response:**
```json
{
  "jobId": "<uuid>",
  "alreadyRunning": false
}
```

If a job is already `pending` or `processing` for the same group, `alreadyRunning` is `true` and the existing `jobId` is returned — no duplicate job is created.

### Poll job status

```json
{
  "cmd": "aa.jobs.beneficiary.getQrPdfJob",
  "uuid": "<PROJECT_ID>"
}
```

**Payload:**
```json
{ "jobId": "<uuid>" }
```

**Response:**
```json
{
  "status": "pending | processing | completed | failed",
  "fileUrl": "https://...",
  "error": null
}
```

When `status` is `completed`, `fileUrl` contains the direct link to the generated PDF in R2.

## Database

A `tbl_pdf_generation_jobs` table tracks job state:

| Column | Type | Description |
|---|---|---|
| `uuid` | String (unique) | Job ID returned to callers |
| `status` | String | `pending` \| `processing` \| `completed` \| `failed` |
| `groupId` | String | Beneficiary group UUID |
| `fileUrl` | String? | R2 URL set on completion |
| `error` | String? | Error message set on failure |

## Environment Variables

Add to `.env`:

```env
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_BUCKET=rahat-qr-pdfs
R2_PUBLIC_DOMAIN=<account-id>.r2.cloudflarestorage.com
```

R2 uses the S3-compatible API. Generated PDFs are stored at key `qr-pdfs/<groupId>/<jobUuid>.pdf`.

## Memory Considerations

Beneficiaries are fetched and processed in batches of 200 to avoid loading the entire group into memory at once. OTPs are bulk-fetched per batch using a single `IN` query. For 10,000 beneficiaries this results in ~50 iterations with a peak memory footprint of a few hundred KB per batch.
