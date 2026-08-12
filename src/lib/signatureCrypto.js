import crypto from "crypto";

function getKey() {
  const raw = process.env.SIGNATURE_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing SIGNATURE_ENCRYPTION_KEY environment variable.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SIGNATURE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptSignature(value) {
  if (!value || typeof value !== "string") throw new Error("Signature is required.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSignature(payload) {
  if (!payload) return null;
  const [iv64, tag64, data64] = String(payload).split(".");
  if (!iv64 || !tag64 || !data64) throw new Error("Invalid encrypted signature.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv64, "base64"));
  decipher.setAuthTag(Buffer.from(tag64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data64, "base64")), decipher.final()]).toString("utf8");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function canonicalRequisitionSnapshot(requisition) {
  return JSON.stringify({
    id: String(requisition._id), requisitionNumber: requisition.requisitionNumber || null,
    estimatedCost: Number(requisition.estimatedCost || 0), status: requisition.status,
    finalApprovalAt: requisition.finalApprovalAt ? new Date(requisition.finalApprovalAt).toISOString() : null,
    procurementStatus: requisition.procurementStatus || null, requester: requisition.requester?._id ? String(requisition.requester._id) : String(requisition.requester),
    department: requisition.department || "", category: requisition.category || "", purpose: requisition.purpose || "", urgency: requisition.urgency || "",
    items: (requisition.items || []).map((i) => ({ name:i.name, quantity:Number(i.quantity||0), unitCost:Number(i.unitCost||0), totalCost:Number(i.totalCost||0) })),
  });
}

export function requisitionIntegrityHash(requisition) { return sha256(canonicalRequisitionSnapshot(requisition)); }
