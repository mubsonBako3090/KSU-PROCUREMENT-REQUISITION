import mongoose from "mongoose";

const RequisitionSnapshotSchema = new mongoose.Schema({
  requisition: { type: mongoose.Schema.Types.ObjectId, ref: "Requisition", required: true },
  requisitionNumber: { type: String, required: true }, requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  requesterName: { type: String, required: true }, department: { type: String, required: true }, category: String, purpose: String, urgency: String,
  estimatedCost: { type: Number, default: 0 }, items: { type: mongoose.Schema.Types.Mixed, default: [] }, integrityHash: { type: String, required: true },
}, { _id:false });

const ProcurementBatchSchema = new mongoose.Schema({
  batchNumber: { type:String, unique:true, required:true, index:true },
  createdBy: { type:mongoose.Schema.Types.ObjectId, ref:"User", required:true },
  requisitions: { type:[RequisitionSnapshotSchema], required:true }, totalEstimatedCost: { type:Number, default:0 },
  status: { type:String, enum:["draft","submitted","cancelled"], default:"draft", index:true },
  signedBy: { type:mongoose.Schema.Types.ObjectId, ref:"User" }, signedAt: Date, documentHash: String,
  signatureCiphertext: { type:String, select:false }, submittedAt: Date, cancelledAt: Date,
}, { timestamps:true });

ProcurementBatchSchema.index({createdBy:1,createdAt:-1});
ProcurementBatchSchema.index({status:1,createdAt:-1});
export default mongoose.models.ProcurementBatch || mongoose.model("ProcurementBatch", ProcurementBatchSchema);
