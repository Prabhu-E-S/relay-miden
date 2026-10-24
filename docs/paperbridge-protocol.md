# PaperBridge Protocol Specification

> Phase 5 extension: this document's version 1 `TASK_CREATE` format remains unchanged. Version 2 `TASK_UPDATE` and `TASK_ACK` envelopes are defined in [synchronization-protocol.md](synchronization-protocol.md). The decoder dispatches by explicit protocol version; no existing v1 field changes meaning.

## 1. Overview

PaperBridge is Relay Miden's network-independent task transmission mechanism. It serializes, cryptographically hashes, and encodes structured operational tasks into high-density 2D Quick Response (QR) matrices. These codes can be rendered on screen or printed on paper, enabling disconnected peer-to-peer data ingestion without local networks, Wi-Fi access points, Bluetooth pairing, public internet, cloud relays, or user credentials.

PaperBridge ensures high scan reliability, deterministic checksums, collision protection, atomic IndexedDB storage, and strict schema validation.

---

## 2. Protocol Header and Identity

Every valid PaperBridge payload begins with an immutable protocol header:

| Field         | Value / Type                       | Description                                                                                             |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `protocol`    | `"RELAY_MIDEN_PAPERBRIDGE"`        | Unique protocol namespace identifier                                                                    |
| `version`     | `1`                                | Monotonically incrementing protocol version                                                             |
| `messageId`   | UUID string (v4)                   | Cryptographically random unique message identifier for transmission deduplication                       |
| `messageType` | `"TASK_CREATE"`                    | Envelope payload intent (Phase 3 currently supports `TASK_CREATE`; Phase 5 extends with status updates) |
| `senderId`    | UUID string                        | Anonymous device identifier of the transmitting host                                                    |
| `createdAt`   | ISO 8601 UTC string                | Timestamp when the message envelope was generated                                                       |
| `checksum`    | 64-character lowercase hexadecimal | SHA-256 digest of canonicalized envelope content (excluding the checksum field itself)                  |

---

## 3. Envelope Structure

```typescript
interface PaperBridgeEnvelope {
  protocol: 'RELAY_MIDEN_PAPERBRIDGE';
  version: 1;
  messageId: string;
  messageType: 'TASK_CREATE';
  senderId: string;
  createdAt: string;
  payload: PaperBridgeTaskPayload;
  checksum: string;
}
```

### 3.1 Task Payload Schema

```typescript
interface PaperBridgeTaskPayload {
  taskId: string;
  action:
    | 'REQUEST_VOLUNTEERS'
    | 'DELIVER_SUPPLIES'
    | 'REPORT_ISSUE'
    | 'REQUEST_ASSISTANCE'
    | 'MOVE_TO_LOCATION'
    | 'CUSTOM';
  title: string; // 1..120 chars
  description?: string; // max 1000 chars
  quantity?: number; // positive integer <= 100,000
  unit?: string; // max 40 chars (required if quantity is specified)
  location: string; // 1..160 chars
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'acknowledged' | 'in_progress' | 'completed';
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  createdBy: string; // Device ID of original author
  revision: number; // Positive integer >= 1
}
```

---

## 4. Canonical Serialization & Checksum Algorithm

To ensure deterministic checksum generation and verification across diverse platforms, JavaScript engines, and runtime environments:

1. **Envelope Isolation**: The `checksum` property is omitted from the input object.
2. **Key Ordering**: Object keys are recursively sorted lexicographically (Unicode code point order).
3. **Undefined Stripping**: `undefined` properties are excluded from canonical JSON output.
4. **UTF-8 Encoding**: The canonical string is encoded into a raw byte buffer via `TextEncoder`.
5. **SHA-256 Hashing**: A 256-bit cryptographic hash is calculated using the Web Crypto API (`crypto.subtle.digest('SHA-256', bytes)`).
6. **Hex Representation**: The digest is formatted as a 64-character lowercase hexadecimal string.

```typescript
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return '{' + pairs.join(',') + '}';
}
```

---

## 5. Size and Capacity Boundaries

Single QR codes degrade in scan speed and camera reliability as data density increases. PaperBridge sets a strict payload budget:

- **Maximum Allowed Encoded Payload**: 2,048 UTF-8 bytes (`MAX_PAPERBRIDGE_PAYLOAD_BYTES`).
- **QR Error Correction Level**: Level `M` (Medium ~15% recovery) to tolerate screen glare, finger smudges, or partial paper tears.
- **Quiet Zone Margin**: 4 modules minimum to prevent finder pattern detection failures.
- **Oversized Handling**: If task fields exceed 2,048 bytes, `encodeTaskForQR` rejects encoding with `OVERSIZED_PAYLOAD` and informs the user which fields to shorten.

---

## 6. Ingestion & Duplicate Handling Pipeline

When a receiving device captures a PaperBridge QR code (via camera or image upload), it executes a strict sequential verification pipeline before persisting:

```text
[Raw Scanned String]
       │
       ▼
1. Size Ceiling Check (<= 4,096 bytes)
       │
       ▼
2. JSON Syntactic Parsing
       │
       ▼
3. Protocol Namespace Verification ('RELAY_MIDEN_PAPERBRIDGE')
       │
       ▼
4. Version Compatibility Check (version === 1)
       │
       ▼
5. Envelope Schema Validation (Zod)
       │
       ▼
6. Recalculate & Compare SHA-256 Checksum
       │
       ▼
7. User Confirmation & Visual Preview
       │
       ▼
8. Atomic IndexedDB Transaction:
   ├── Deduplication Check (messageId & taskId)
   ├── Conflict Detection (differing revision)
   ├── Append Import Record (`imports` table)
   ├── Append Audit Ledger (`operations` table with TASK_IMPORT)
   └── Persist Task Record (`tasks` table)
```

### Duplicate & Conflict Semantics:

1. **Duplicate Message ID**: If `messageId` exists in `imports`, return `status: duplicate` without creating duplicate tasks or operations.
2. **Identical Task ID & Revision**: If local task exists with identical revision and content, register import deduplication record and return `status: duplicate`.
3. **Revision Conflict**: If local task exists with a different revision (`existing.revision !== incoming.revision`), reject overwrite, preserve local task, and return `status: conflict` (`REVISION_CONFLICT`). Revision merging is deferred to Phase 5.
4. **Locally Soft-Deleted Tasks**: If local task exists with `deletedAt !== null`, do not silently resurrect; return `status: conflict` (`TASK_DELETED_LOCALLY`).

---

## 7. Security and Integrity Boundary

- **Integrity**: SHA-256 checksums protect against accidental data truncation, lens flare corruption, or optical distortion during scan.
- **Non-Authentication**: SHA-256 checksums verify byte integrity; they do **not** provide cryptographic digital signatures or prove device identity.
- **Untrusted Input**: All incoming QR content is parsed in an isolated try-catch sandbox with strict Zod parsing before any database interaction.
- **No Remote Calls**: All parsing, image decoding, and cryptographic operations happen 100% locally in the browser runtime.

---

## 8. Planned Future Extensions (Phase 5)

Phase 5 will extend PaperBridge to support two-way task lifecycle handshakes:

- `TASK_STATUS_UPDATE`: Transmitting status changes (e.g. from `pending` to `in_progress` or `completed`).
- `TASK_ACKNOWLEDGMENT`: Cryptographic receipt receipts indicating a task was accepted by a field coordinator.
- Multi-revision convergence heuristics.
