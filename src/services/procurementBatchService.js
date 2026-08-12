import crypto from "crypto";
import Requisition from "@/models/Requisition";
import ProcurementBatch from "@/models/ProcurementBatch";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { ROLES } from "@/constants/roles";
import { REQUISITION_STATUS } from "@/constants/requisitionOptions";
import { requisitionIntegrityHash, sha256 } from "@/lib/signatureCrypto";
import { verifyPassword } from "@/lib/auth";

const batchNumber = () => { const d=new Date(); return `PB-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`; };
const assertVc = (auth) => { if (!auth || auth.role !== ROLES.VC) throw new Error("Only the Vice-Chancellor can perform this action."); };

export async function createProcurementBatch({auth,requisitionIds}) {
  assertVc(auth);
  if (!Array.isArray(requisitionIds) || !requisitionIds.length) throw new Error("Select at least one approved requisition.");
  const ids=[...new Set(requisitionIds.map(String))];
  const rows=await Requisition.find({_id:{$in:ids}}).populate("requester","fullName").lean();
  if(rows.length!==ids.length) throw new Error("One or more selected requisitions could not be found.");
  const map=new Map(rows.map(r=>[String(r._id),r])); const ordered=ids.map(id=>map.get(id));
  for(const r of ordered){
    if(r.status!==REQUISITION_STATUS.APPROVED || r.procurementStatus!=="ready") throw new Error(`${r.requisitionNumber||r._id} is not ready for Procurement.`);
    if(r.procurementBatch) throw new Error(`${r.requisitionNumber||r._id} is already assigned to a Procurement Batch.`);
    if(!r.finalApprovalAt) throw new Error(`${r.requisitionNumber||r._id} has no recorded final VC approval.`);
  }
  const snapshots=ordered.map(r=>({ requisition:r._id, requisitionNumber:r.requisitionNumber||String(r._id), requester:r.requester?._id||r.requester, requesterName:r.requester?.fullName||"Unknown requester", department:r.department, category:r.category, purpose:r.purpose, urgency:r.urgency, estimatedCost:Number(r.estimatedCost||0), items:(r.items||[]).map(i=>({name:i.name,quantity:i.quantity,unitCost:i.unitCost,totalCost:i.totalCost})), integrityHash:requisitionIntegrityHash(r) }));
  const total=snapshots.reduce((s,r)=>s+Number(r.estimatedCost||0),0);
  const batch=await ProcurementBatch.create({batchNumber:batchNumber(),createdBy:auth.sub,requisitions:snapshots,totalEstimatedCost:total});
  const assignment=await Requisition.updateMany({_id:{$in:ids},procurementBatch:{$exists:false}},{$set:{procurementBatch:batch._id,procurementBatchAddedAt:new Date()}});
  if(assignment.modifiedCount!==ids.length){ await Requisition.updateMany({procurementBatch:batch._id},{$unset:{procurementBatch:1,procurementBatchAddedAt:1}}); await ProcurementBatch.deleteOne({_id:batch._id}); throw new Error("One or more requisitions was assigned to another batch while this batch was being created. Please try again."); }
  await AuditLog.create({actor:auth.sub,action:"procurement_batch.create",entityType:"ProcurementBatch",entityId:batch._id,details:{batchNumber:batch.batchNumber,requisitionIds:ids,totalEstimatedCost:total}});
  return batch;
}

export async function signProcurementBatch({auth,batchId,password,generatePdf}) {
  assertVc(auth); if(!password) throw new Error("Password confirmation is required.");
  const user=await User.findById(auth.sub).select("+passwordHash +signatureCiphertext fullName email role accountStatus");
  if(!user || user.accountStatus!=="active" || user.role!==ROLES.VC) throw new Error("VC account is not active or authorized.");
  if(!(await verifyPassword(password,user.passwordHash))) throw new Error("Password confirmation failed.");
  if(!user.signatureCiphertext) throw new Error("Please save your VC digital signature in Settings before signing.");
  const batch=await ProcurementBatch.findById(batchId); if(!batch) throw new Error("Procurement Batch not found.");
  if(batch.status!=="draft") throw new Error("This batch has already been signed, submitted, or cancelled.");
  if(String(batch.createdBy)!==String(auth.sub)) throw new Error("Only the VC who created this batch can sign it.");
  const ids=batch.requisitions.map(r=>r.requisition); const current=await Requisition.find({_id:{$in:ids}}).populate("requester","fullName").lean();
  if(current.length!==ids.length) throw new Error("A requisition in this batch no longer exists.");
  const map=new Map(current.map(r=>[String(r._id),r]));
  for(const snap of batch.requisitions){ const r=map.get(String(snap.requisition)); if(!r) throw new Error(`Missing requisition ${snap.requisitionNumber}.`); if(r.status!==REQUISITION_STATUS.APPROVED||r.procurementStatus!=="ready") throw new Error(`${snap.requisitionNumber} is no longer ready for Procurement.`); if(r.procurementBatch&&String(r.procurementBatch)!==String(batch._id)) throw new Error(`${snap.requisitionNumber} belongs to another batch.`); if(requisitionIntegrityHash(r)!==snap.integrityHash) throw new Error(`${snap.requisitionNumber} changed after it was added to the batch.`); }
  const signedAt=new Date(); const pdfBuffer=await generatePdf({batch,signer:user,signedAt,signatureCiphertext:user.signatureCiphertext}); const documentHash=sha256(pdfBuffer);
  const updated=await ProcurementBatch.findOneAndUpdate({_id:batch._id,status:"draft",signedBy:{$exists:false}},{$set:{status:"submitted",signedBy:user._id,signedAt,submittedAt:signedAt,documentHash,signatureCiphertext:user.signatureCiphertext}},{new:true});
  if(!updated) throw new Error("This batch was signed by another request or is no longer available.");
  await AuditLog.create({actor:user._id,action:"procurement_batch.sign",entityType:"ProcurementBatch",entityId:batch._id,details:{batchNumber:batch.batchNumber,requisitionIds:ids,totalEstimatedCost:batch.totalEstimatedCost,documentHash,signedAt}});
  await AuditLog.create({actor:user._id,action:"procurement_batch.submit_to_procurement",entityType:"ProcurementBatch",entityId:batch._id,details:{batchNumber:batch.batchNumber,submittedAt:signedAt}});
  return {batch:updated,pdfBuffer};
}
