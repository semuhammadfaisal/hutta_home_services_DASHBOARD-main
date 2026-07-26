const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const CustomerInvoice = require('../models/CustomerInvoice');
const CustomerSatisfactionDecision = require('../models/CustomerSatisfactionDecision');
const CloseoutSettings = require('../models/CloseoutSettings');
const EmailOutbox = require('../models/EmailOutbox');
const JobCompletion = require('../models/JobCompletion');
const JobSchedule = require('../models/JobSchedule');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const Payment = require('../models/Payment');
const PaymentProofSubmission = require('../models/PaymentProofSubmission');
const QuoteSettings = require('../models/QuoteSettings');
const User = require('../models/User');
const VendorWorkOrder = require('../models/VendorWorkOrder');
const { createCustomerInvoicePdf } = require('../utils/invoicePdf');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const memCache = require('../utils/memoryCache');
const { synchronizePaymentStage, synchronizeWorkflowOrder } = require('../utils/workflowSync');
const {
  COMPLETION_TOKEN_TTL_MS, SATISFACTION_TOKEN_TTL_MS, FOLLOWUP_DELAY_MS,
  MAX_FILES_PER_CATEGORY, MAX_FILE_BYTES, MAX_PUBLIC_BODY_BYTES, cleanText, generateToken, hashToken,
  encryptToken, nextCompletionReference, nextInvoiceNumber, nextPaymentId,
  nextPaymentProofReference, completionSnapshotHash, invoiceSnapshotHash, evidenceSnapshotHash, parseSatisfaction,
  MAX_PAYMENT_PROOF_FILES, MAX_PAYMENT_PROOF_FILE_BYTES
} = require('../utils/closeout');

const router = express.Router();
const staffRoles = checkRole(['admin', 'manager', 'account_rep']);
const adminOnly = checkRole(['admin']);
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const CLOSEOUT_TYPES = [
  'vendor_completion_link','vendor_completion_confirmation','customer_completion_satisfaction',
  'customer_satisfaction_followup','customer_satisfaction_confirmation','customer_issue_confirmation',
  'staff_completion_alert','staff_satisfaction_alert','staff_closeout_issue_alert','staff_closeout_issue_resolved',
  'customer_closeout_review','customer_closeout_followup','customer_closeout_confirmation',
  'customer_closeout_issue_confirmation','customer_closeout_issue_resolved',
  'customer_payment_proof_received','staff_payment_proof_alert',
  'customer_payment_proof_verified','customer_payment_proof_rejected'
];
const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);
const CLOSEOUT_CONFIRMATION_STATEMENT = 'I have reviewed the service details and available before-and-after evidence. I confirm that the described work has been completed to my satisfaction. I understand that payment verification is handled separately.';
router.use('/public', (_req, res, next) => { noStore(res); next(); });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_CATEGORY * 2 },
  fileFilter: (_req, file, callback) => {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    callback(allowedExtensions.has(ext) ? null : new Error('Only JPG, PNG, and WebP photos are allowed'), allowedExtensions.has(ext));
  }
}).fields([{ name: 'beforePhotos', maxCount: MAX_FILES_PER_CATEGORY }, { name: 'afterPhotos', maxCount: MAX_FILES_PER_CATEGORY }]);
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PAYMENT_PROOF_FILE_BYTES, files: MAX_PAYMENT_PROOF_FILES },
  fileFilter: (_req, file, callback) => {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    callback(allowedExtensions.has(ext) ? null : new Error('Only JPG, PNG, and WebP payment-proof images are allowed'), allowedExtensions.has(ext));
  }
}).array('proofImages', MAX_PAYMENT_PROOF_FILES);

const actorId = req => req.user?.userId || req.user?.id;
const noStore = res => res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' });
const staffEmails = () => String(process.env.CLOSEOUT_NOTIFICATION_EMAILS || process.env.INTAKE_NOTIFICATION_EMAILS || 'sales@huttas.com').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
const invalidate = () => { memCache.del('orders:stats:v2'); invalidateDashboardStatsCache(); };
function uploadMiddleware(req, res, next) {
  upload(req, res, error => {
    if (!error) {
      const totalBytes = Object.values(req.files || {}).flat().reduce((total, file) => total + Number(file.size || 0), 0);
      if (totalBytes > MAX_PUBLIC_BODY_BYTES) return res.status(413).json({ message: 'The combined completion upload is too large' });
      return next();
    }
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'A completion photo exceeds the file-size limit' });
    return res.status(400).json({ message: error.message || 'Photo upload failed' });
  });
}
function proofUploadMiddleware(req, res, next) {
  proofUpload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'A payment-proof image exceeds the 10 MB limit' });
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ message: 'Upload no more than three payment-proof images' });
    return res.status(400).json({ message: error.message || 'Payment-proof upload failed' });
  });
}
function validPhoto(file) {
  const ext = String(file.originalname || '').split('.').pop().toLowerCase(); const b = file.buffer || Buffer.alloc(0);
  if (['jpg','jpeg'].includes(ext)) return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === 'png') return b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (ext === 'webp') return b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP';
  return false;
}
async function storePhotos(files, completion, category, uploader) {
  if (files.some(file => !validPhoto(file))) throw Object.assign(new Error(`A ${category} photo does not match its declared file type`), { status: 400 });
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }); const stored = [];
  try {
    for (const file of files) {
      const documentId = crypto.randomUUID(); const safe = String(file.originalname || `${category}.jpg`).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120);
      const fileId = await new Promise((resolve,reject) => { const stream=bucket.openUploadStream(`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safe}`,{metadata:{documentId,entityType:'order',entityId:completion.orderId,jobCompletionId:completion._id,category,originalName:file.originalname,linkStatus:'pending'}});stream.once('error',reject);stream.once('finish',()=>resolve(stream.id));stream.end(file.buffer); });
      stored.push({ documentId, name:file.originalname, url:`/api/attachments/order/${completion.orderId}/${documentId}`, type:file.mimetype || 'application/octet-stream', size:file.size, storageProvider:'gridfs', fileId, uploadedAt:new Date(), uploadedBy:uploader.id, uploadedByEmail:uploader.email, status:'active', complianceDocumentType:`completion_${category}` });
    }
    return stored;
  } catch (error) {
    await deleteStored(stored);
    throw error;
  }
}
async function deleteStored(files) {
  if (!files.length || !mongoose.connection.db) return;
  const bucket = new GridFSBucket(mongoose.connection.db,{bucketName:'uploads'});
  await Promise.allSettled(files.map(file => bucket.delete(file.fileId)));
}
async function markStoredLinked(files) {
  if (!files.length) return;
  await mongoose.connection.db.collection('uploads.files').updateMany({ _id: { $in: files.map(file => file.fileId) } }, { $set: { 'metadata.linkStatus':'linked' } });
}
async function globalCloseoutSettings(session) {
  const query = CloseoutSettings.findOne({ key: 'global' });
  if (session) query.session(session);
  const settings = await query.lean();
  return settings || {
    key: 'global',
    paymentMethods: [],
    remittanceContact: 'sales@huttas.com',
    proofUploadInstructions: 'Upload a clear image showing the transaction date, amount, and reference.',
    customerCloseoutEmailMessage: 'Please review the completed work, confirm the service, and review your invoice.'
  };
}
function publicSettingsSnapshot(settings) {
  return {
    paymentMethods: (settings.paymentMethods || [])
      .filter(method => method.enabled !== false)
      .map(method => ({
        key: cleanText(method.key, 50),
        label: cleanText(method.label, 100),
        instructions: cleanText(method.instructions, 4000),
        transactionReferenceRequired: Boolean(method.transactionReferenceRequired)
      })),
    remittanceContact: cleanText(settings.remittanceContact, 500),
    proofUploadInstructions: cleanText(settings.proofUploadInstructions, 2000),
    customerCloseoutEmailMessage: cleanText(settings.customerCloseoutEmailMessage, 3000)
  };
}
async function findPublicCloseout(token, session) {
  const query = JobCompletion.findOne({
    satisfactionTokenHash: hashToken(token),
    status: 'completed',
    satisfactionTokenExpiresAt: { $gt: new Date() },
    closeoutTokenRevokedAt: { $exists: false }
  }).select('+satisfactionTokenHash');
  if (session) query.session(session);
  return query;
}
function closeoutOutbox(completion, invoice, order, token, type, options = {}) {
  const payload = {
    completionReference: completion.completionReference,
    invoiceNumber: invoice.invoiceNumber,
    requestReference: completion.jobSnapshot.requestReference,
    orderReference: completion.jobSnapshot.orderReference,
    customerName: completion.customerSnapshot.name,
    customerEmail: completion.customerSnapshot.email,
    vendorName: completion.vendorSnapshot.name,
    service: completion.jobSnapshot.service,
    address: completion.customerSnapshot.address,
    scopeOfWork: completion.jobSnapshot.scopeOfWork,
    scheduledStart: completion.scheduleSnapshot.scheduledStart,
    scheduledEnd: completion.scheduleSnapshot.scheduledEnd,
    completedAt: completion.completedAt,
    completionNotes: completion.completionNotes,
    amount: invoice.amount,
    paymentInstructions: invoice.paymentInstructionsSnapshot,
    closeoutRevision: completion.closeoutRevision,
    encryptedSatisfactionToken: encryptToken(token),
    ...options.payload
  };
  return {
    type,
    dedupeKey: options.dedupeKey || `${completion._id}:${type}:r${completion.closeoutRevision}`,
    recipients: options.recipients || [completion.customerSnapshot.email],
    payload,
    orderId: order._id,
    outgoingQuoteId: completion.outgoingQuoteId,
    jobCompletionId: completion._id,
    customerInvoiceId: invoice._id,
    satisfactionDecisionId: options.satisfactionDecisionId,
    paymentProofSubmissionId: options.paymentProofSubmissionId,
    nextAttemptAt: options.nextAttemptAt
  };
}
async function notifyStaff(session, title, message, type, orderId, metadata={}) {
  const users=await User.find({isActive:true,role:{$in:['admin','manager','account_rep']}}).select('_id').session(session).lean();
  if(users.length) await Notification.insertMany(users.map(user=>({userId:user._id,title,message,type,priority:type==='error'?'high':'medium',actionUrl:'#workflow-center/stage-6',metadata:{orderId,...metadata}})),{session});
}
function safeCompletion(value) {
  if (!value) return null; const item=value.toObject?value.toObject():{...value}; delete item.publicTokenHash; delete item.satisfactionTokenHash; return item;
}
function safePaymentProof(value, includeAudit = false) {
  if (!value) return null;
  const item=value.toObject?value.toObject():{...value};
  if (!includeAudit) { delete item.ipAddress; delete item.userAgent; }
  item.proofImages=(item.proofImages||[]).map(image=>{
    const safe={...image};
    delete safe.fileId;
    delete safe.url;
    return safe;
  });
  return item;
}
function completionLinkOutbox(completion, token, type='vendor_completion_link') {
  return {type,dedupeKey:`${completion._id}:${type}:${Date.now()}`,recipients:[completion.vendorSnapshot.email],payload:{encryptedCompletionToken:encryptToken(token),vendorName:completion.vendorSnapshot.name,completionReference:completion.completionReference,requestReference:completion.jobSnapshot.requestReference,service:completion.jobSnapshot.service,scheduledEnd:completion.scheduleSnapshot.scheduledEnd},orderId:completion.orderId,outgoingQuoteId:completion.outgoingQuoteId,jobScheduleId:completion.jobScheduleId,vendorWorkOrderId:completion.vendorWorkOrderId,jobCompletionId:completion._id};
}
async function ensureCompletion(orderId, options={}) {
  let existing=await JobCompletion.findOne({orderId}).select('+publicTokenHash +satisfactionTokenHash'); if(existing&&!options.rotate)return {completion:existing,token:null};
  const session=await mongoose.startSession(); let result;
  try { await session.withTransaction(async()=>{
    const order=await Order.findOne({_id:orderId,workflowStatus:{$in:['scheduled','completed','closeout_issue_reported']}}).session(session);
    if(!order) throw Object.assign(new Error('Only a scheduled Order can enter closeout'),{status:409});
    const [schedule,quote,workOrder]=await Promise.all([JobSchedule.findOne({_id:order.confirmedJobScheduleId,status:'accepted'}).session(session),OutgoingQuote.findOne({_id:order.approvedOutgoingQuoteId,status:'sent',customerDecisionStatus:'approved'}).session(session),VendorWorkOrder.findOne({jobScheduleId:order.confirmedJobScheduleId}).session(session)]);
    if(!schedule||!quote||!workOrder) throw Object.assign(new Error('Confirmed schedule, approved quote, and work order are required'),{status:409});
    const token=generateToken(); const expires=new Date(new Date(schedule.proposedEnd).getTime()+COMPLETION_TOKEN_TTL_MS);
    let completion=await JobCompletion.findOne({orderId:order._id}).session(session).select('+publicTokenHash +satisfactionTokenHash');
    if(!completion){const reference=await nextCompletionReference(session);[completion]=await JobCompletion.create([{completionReference:reference,orderId:order._id,jobScheduleId:schedule._id,outgoingQuoteId:quote._id,vendorWorkOrderId:workOrder._id,customerId:order.customerId,vendorId:order.vendor,status:'pending',customerSnapshot:quote.customerSnapshot,vendorSnapshot:{name:schedule.vendorSnapshot.name,email:schedule.vendorSnapshot.email,phone:schedule.vendorSnapshot.phone},scheduleSnapshot:{scheduleReference:schedule.scheduleReference,scheduledStart:schedule.proposedStart,scheduledEnd:schedule.proposedEnd,timezone:schedule.timezone,accessInstructions:schedule.accessInstructions},jobSnapshot:{requestReference:order.requestReference,orderReference:order.orderId,service:order.service,description:order.description,scopeOfWork:quote.scopeOfWork},approvedTotal:quote.customerTotal,publicTokenHash:hashToken(token),tokenExpiresAt:expires,tokenSentAt:new Date(),history:[{action:'completion_link_created',actorType:'system'}]}],{session});}
    else { if(completion.status!=='pending') throw Object.assign(new Error('This job is already completed'),{status:409}); completion.publicTokenHash=hashToken(token);completion.tokenExpiresAt=expires;completion.tokenSentAt=new Date();completion.tokenRevokedAt=undefined;completion.history.push({action:'completion_link_rotated',actorType:'staff',actorId:options.actorId,actorEmail:options.actorEmail});await completion.save({session});}
    result={completion,token};
  }); return result; } finally { await session.endSession(); }
}
async function completeJob({completion,source,notes,enteredName,beforeFiles,afterFiles,photoOverride,overrideReason,actor,ip,userAgent}) {
  if((!beforeFiles.length||!afterFiles.length)&&!(source==='staff'&&photoOverride&&overrideReason.length>=10)) throw Object.assign(new Error('At least one before and one after photo are required'),{status:400});
  const before=await storePhotos(beforeFiles,completion,'before',actor);let after=[];
  try{after=await storePhotos(afterFiles,completion,'after',actor);}catch(error){await deleteStored(before);throw error}
  const all=[...before,...after];const session=await mongoose.startSession();let result;
  try{await session.withTransaction(async()=>{
    const current=await JobCompletion.findOne({_id:completion._id,status:'pending'}).session(session).select('+publicTokenHash +satisfactionTokenHash');
    if(!current) throw Object.assign(new Error('This job has already been completed'),{status:409});
    const order=await Order.findOne({_id:current.orderId,workflowStatus:'scheduled',confirmedJobScheduleId:current.jobScheduleId}).session(session);
    const quote=await OutgoingQuote.findOne({_id:current.outgoingQuoteId,status:'sent',customerDecisionStatus:'approved'}).session(session);
    if(!order||!quote) throw Object.assign(new Error('The Order is no longer ready for completion'),{status:409});
    const now=new Date(); const invoiceNumber=await nextInvoiceNumber(session); const paymentReference=await nextPaymentId(session); const satisfactionToken=generateToken();
    const [quoteSettings, closeoutSettings] = await Promise.all([
      QuoteSettings.findOne({key:'global'}).session(session).lean(),
      globalCloseoutSettings(session)
    ]);
    const paymentInstructionsSnapshot = publicSettingsSnapshot(closeoutSettings);
    Object.assign(current,{source,status:'completed',completionNotes:notes,completedAt:now,vendorEnteredName:enteredName,beforePhotos:before,afterPhotos:after,photoOverride,photoOverrideReason:overrideReason,completedBy:source==='staff'?actor.id:undefined,completedByEmail:actor.email,publicTokenHash:undefined,tokenRevokedAt:now,satisfactionTokenHash:hashToken(satisfactionToken),satisfactionTokenExpiresAt:new Date(now.getTime()+SATISFACTION_TOKEN_TTL_MS),closeoutRevision:1,closeoutTokenSentAt:now,closeoutTokenRevokedAt:undefined});
    current.completionSnapshotHash=completionSnapshotHash(current);
    const invoiceData={invoiceNumber,orderId:order._id,jobCompletionId:current._id,outgoingQuoteId:quote._id,customerId:order.customerId,amount:quote.customerTotal,issuedAt:now,dueDate:now,terms:'Due on receipt',companySnapshot:quoteSettings?.company||{name:'Hutta Home Services',email:'sales@huttas.com'},customerSnapshot:quote.customerSnapshot,jobSnapshot:{...current.jobSnapshot,scopeOfWork:quote.scopeOfWork},quoteSnapshot:{quoteReference:quote.quoteReference,revisionNumber:quote.revisionNumber,customerTotal:quote.customerTotal},paymentInstructionsSnapshot};
    invoiceData.snapshotHash=invoiceSnapshotHash(invoiceData);const [invoice]=await CustomerInvoice.create([invoiceData],{session});
    const [payment]=await Payment.create([{paymentId:paymentReference,invoiceNumber,order:order._id,customer:order.customerId,amount:quote.customerTotal,status:'pending',dueDate:now,description:`Invoice ${invoiceNumber} for ${order.service}`,source:'stage6_invoice',customerInvoiceId:invoice._id,jobCompletionId:current._id,outgoingQuoteId:quote._id,invoiceIssuedAt:now}],{session});
    invoice.paymentId=payment._id;await invoice.save({session});current.customerInvoiceId=invoice._id;current.history.push({action:'completed',actorType:source,actorId:source==='staff'?actor.id:undefined,actorEmail:actor.email,message:notes});await current.save({session});
    order.jobCompletionId=current._id;order.customerInvoiceId=invoice._id;order.completedAt=undefined;order.completedBy=undefined;order.closeoutRequestedAt=now;order.satisfactionStatus='pending';order.documents.push(...all);const sync=await synchronizeWorkflowOrder(order,'awaiting_customer_closeout',{session});
    const base={completionReference:current.completionReference,invoiceNumber,requestReference:order.requestReference,orderReference:order.orderId,customerName:quote.customerSnapshot.name,vendorName:current.vendorSnapshot.name,service:order.service,address:quote.customerSnapshot.address,scopeOfWork:quote.scopeOfWork,scheduledStart:current.scheduleSnapshot.scheduledStart,scheduledEnd:current.scheduleSnapshot.scheduledEnd,completedAt:now,completionNotes:notes,amount:quote.customerTotal,paymentInstructions:paymentInstructionsSnapshot};
    await EmailOutbox.insertMany([
      {type:'vendor_completion_confirmation',dedupeKey:`${current._id}:vendor_completion_confirmation`,recipients:[current.vendorSnapshot.email],payload:base,orderId:order._id,outgoingQuoteId:quote._id,jobCompletionId:current._id,customerInvoiceId:invoice._id},
      closeoutOutbox(current,invoice,order,satisfactionToken,'customer_closeout_review'),
      closeoutOutbox(current,invoice,order,satisfactionToken,'customer_closeout_followup',{nextAttemptAt:new Date(now.getTime()+FOLLOWUP_DELAY_MS)}),
      {type:'staff_completion_alert',dedupeKey:`${current._id}:staff_completion_alert`,recipients:staffEmails(),payload:base,orderId:order._id,outgoingQuoteId:quote._id,jobCompletionId:current._id,customerInvoiceId:invoice._id}
    ],{session});
    await notifyStaff(session,'Customer closeout requested',`${current.completionReference} is awaiting customer confirmation. ${invoiceNumber} was generated.`,'success',order._id,{jobCompletionId:current._id,customerInvoiceId:invoice._id});
    result={completion:current,invoice,payment,sync};
  });await markStoredLinked(all);invalidate();return result;}catch(error){await deleteStored(all);throw error}finally{await session.endSession()}
}

router.get('/public/completion',publicLimiter,async(req,res,next)=>{try{noStore(res);const token=req.get('x-vendor-completion-token')||'';const completion=await JobCompletion.findOne({publicTokenHash:hashToken(token),status:'pending',tokenExpiresAt:{$gt:new Date()}}).select('+publicTokenHash').lean();if(!completion)return res.status(410).json({message:'This completion link is invalid, expired, revoked, or already used'});res.json({completionReference:completion.completionReference,customer:{name:completion.customerSnapshot.name,address:completion.customerSnapshot.address},vendor:{name:completion.vendorSnapshot.name},schedule:completion.scheduleSnapshot,job:completion.jobSnapshot});}catch(error){next(error)}});
router.post('/public/completion',publicLimiter,uploadMiddleware,async(req,res,next)=>{const token=req.get('x-vendor-completion-token')||'';try{const completion=await JobCompletion.findOne({publicTokenHash:hashToken(token),status:'pending',tokenExpiresAt:{$gt:new Date()}}).select('+publicTokenHash +satisfactionTokenHash');if(!completion)return res.status(410).json({message:'This completion link is invalid, expired, revoked, or already used'});const enteredName=cleanText(req.body.vendorEnteredName,160);if(enteredName.length<2)return res.status(400).json({message:'Vendor full name is required'});const result=await completeJob({completion,source:'vendor',notes:cleanText(req.body.completionNotes),enteredName,beforeFiles:req.files?.beforePhotos||[],afterFiles:req.files?.afterPhotos||[],photoOverride:false,overrideReason:'',actor:{id:`vendor:${completion.vendorId}`,email:completion.vendorSnapshot.email},ip:cleanText(req.ip,128),userAgent:cleanText(req.get('user-agent'),1000)});noStore(res);res.status(201).json({success:true,completionReference:result.completion.completionReference,invoiceNumber:result.invoice.invoiceNumber,completedAt:result.completion.completedAt});}catch(error){next(error)}});
router.get('/public/satisfaction',publicLimiter,async(req,res,next)=>{
  try{
    const token=req.get('x-customer-satisfaction-token')||'';
    const completion=await findPublicCloseout(token);
    if(!completion)return res.status(410).json({message:'This customer closeout link is invalid, revoked, or expired'});
    const [invoice, payment, decision, proof] = await Promise.all([
      CustomerInvoice.findById(completion.customerInvoiceId).lean(),
      Payment.findOne({jobCompletionId:completion._id}).select('paymentId status amount paymentMethod transactionId paymentDate dueDate').lean(),
      CustomerSatisfactionDecision.findOne({jobCompletionId:completion._id,closeoutRevision:completion.closeoutRevision}).lean(),
      PaymentProofSubmission.findOne({jobCompletionId:completion._id}).sort({revisionNumber:-1}).lean()
    ]);
    if(!invoice||!payment)return res.status(409).json({message:'This closeout record is incomplete. Please contact Hutta Home Services.'});
    res.json({
      completionReference:completion.completionReference,
      closeoutRevision:completion.closeoutRevision,
      customer:{name:completion.customerSnapshot.name},
      order:{requestReference:completion.jobSnapshot.requestReference,orderReference:completion.jobSnapshot.orderReference,service:completion.jobSnapshot.service,address:completion.customerSnapshot.address,scopeOfWork:completion.jobSnapshot.scopeOfWork},
      vendor:{name:completion.vendorSnapshot.name},
      schedule:completion.scheduleSnapshot,
      completedAt:completion.completedAt,
      completionNotes:completion.completionNotes||'',
      evidence:{
        before:(completion.beforePhotos||[]).map(file=>({documentId:file.documentId,name:file.name,type:file.type,size:file.size})),
        after:(completion.afterPhotos||[]).map(file=>({documentId:file.documentId,name:file.name,type:file.type,size:file.size}))
      },
      confirmationStatement:CLOSEOUT_CONFIRMATION_STATEMENT,
      decision:decision?{decision:decision.decision,typedName:decision.typedName,issueMessage:decision.issueMessage,decisionAt:decision.decisionAt,resolvedAt:decision.resolvedAt}:null,
      invoice:{invoiceNumber:invoice.invoiceNumber,amount:invoice.amount,issuedAt:invoice.issuedAt,dueDate:invoice.dueDate,terms:invoice.terms,paymentInstructions:invoice.paymentInstructionsSnapshot||{}},
      payment,
      paymentProof:proof?{proofReference:proof.proofReference,status:proof.status,revisionNumber:proof.revisionNumber,submittedAt:proof.submittedAt,rejectionReason:proof.rejectionReason}:null
    });
  }catch(error){next(error)}
});
router.get('/public/evidence/:documentId',publicLimiter,async(req,res,next)=>{
  try{
    const token=req.get('x-customer-satisfaction-token')||'';
    const completion=await findPublicCloseout(token);
    if(!completion)return res.status(410).json({message:'This customer closeout link is invalid, revoked, or expired'});
    const file=[...(completion.beforePhotos||[]),...(completion.afterPhotos||[])].find(item=>item.status!=='deleted'&&item.documentId===req.params.documentId);
    if(!file||!file.fileId)return res.status(404).json({message:'Evidence image not found'});
    noStore(res);
    res.set({'Content-Type':file.type||'application/octet-stream','Content-Disposition':`inline; filename="${String(file.name||'evidence').replace(/["\r\n]/g,'_')}"`});
    const stream=new GridFSBucket(mongoose.connection.db,{bucketName:'uploads'}).openDownloadStream(file.fileId);
    stream.once('error',error=>{if(!res.headersSent)next(error);else res.destroy(error)});
    stream.pipe(res);
  }catch(error){next(error)}
});
router.post('/public/satisfaction',publicLimiter,async(req,res,next)=>{
  noStore(res);
  const token=req.get('x-customer-satisfaction-token')||'';
  const {payload,errors}=parseSatisfaction(req.body);
  if(errors.length)return res.status(400).json({message:errors.join('. ')});
  const session=await mongoose.startSession();
  try{
    let result;
    await session.withTransaction(async()=>{
      const completion=await findPublicCloseout(token,session);
      if(!completion)throw Object.assign(new Error('This customer closeout link is invalid, revoked, or expired'),{status:410});
      const existing=await CustomerSatisfactionDecision.findOne({jobCompletionId:completion._id,closeoutRevision:completion.closeoutRevision}).session(session);
      if(existing){result={success:true,decision:existing.decision,decisionAt:existing.decisionAt,duplicate:true};return}
      const invoice=await CustomerInvoice.findById(completion.customerInvoiceId).session(session);
      const order=await Order.findById(completion.orderId).session(session);
      if(!invoice||!order)throw new Error('Closeout records are incomplete');
      const now=new Date();
      const [decision]=await CustomerSatisfactionDecision.create([{
        jobCompletionId:completion._id,orderId:order._id,customerInvoiceId:invoice._id,customerId:order.customerId,
        closeoutRevision:completion.closeoutRevision,decision:payload.decision,typedName:payload.typedName,
        completionConfirmed:payload.decision==='satisfied'&&payload.completionConfirmed,
        confirmationStatement:CLOSEOUT_CONFIRMATION_STATEMENT,
        issueMessage:payload.decision==='issue_reported'?payload.issueMessage:undefined,
        decisionAt:now,completionSnapshotHash:completion.completionSnapshotHash,invoiceSnapshotHash:invoice.snapshotHash,
        evidenceSnapshotHash:evidenceSnapshotHash(completion),
        ipAddress:cleanText(req.ip,128),userAgent:cleanText(req.get('user-agent'),1000)
      }],{session});
      completion.satisfactionDecisionId=decision._id;
      await completion.save({session});
      order.satisfactionDecisionId=decision._id;
      order.satisfactionStatus=payload.decision;
      if(payload.decision==='satisfied'){order.completedAt=now;order.completedBy=undefined}
      const sync=await synchronizeWorkflowOrder(order,payload.decision==='issue_reported'?'closeout_issue_reported':'completed',{session});
      await EmailOutbox.updateMany(
        {jobCompletionId:completion._id,type:{$in:['customer_satisfaction_followup','customer_closeout_followup']},status:{$in:['pending','retry_scheduled']}},
        {$set:{status:'cancelled'}},
        {session}
      );
      const base={
        completionReference:completion.completionReference,invoiceNumber:invoice.invoiceNumber,
        requestReference:completion.jobSnapshot.requestReference,customerName:completion.customerSnapshot.name,
        service:completion.jobSnapshot.service,decision:payload.decision,typedName:payload.typedName,issueMessage:payload.issueMessage,decisionAt:now
      };
      await EmailOutbox.insertMany([
        {type:payload.decision==='issue_reported'?'customer_closeout_issue_confirmation':'customer_closeout_confirmation',dedupeKey:`${completion._id}:customer:${payload.decision}:r${completion.closeoutRevision}`,recipients:[completion.customerSnapshot.email],payload:base,orderId:order._id,jobCompletionId:completion._id,customerInvoiceId:invoice._id,satisfactionDecisionId:decision._id},
        {type:payload.decision==='issue_reported'?'staff_closeout_issue_alert':'staff_satisfaction_alert',dedupeKey:`${completion._id}:staff:${payload.decision}`,recipients:staffEmails(),payload:base,orderId:order._id,jobCompletionId:completion._id,customerInvoiceId:invoice._id,satisfactionDecisionId:decision._id}
      ],{session});
      await notifyStaff(
        session,
        payload.decision==='issue_reported'?'Customer reported a closeout issue':'Customer is satisfied',
        payload.decision==='issue_reported'?payload.issueMessage:`${completion.completionReference} was marked satisfied.`,
        payload.decision==='issue_reported'?'error':'success',
        order._id,
        {jobCompletionId:completion._id,satisfactionDecisionId:decision._id}
      );
      result={success:true,decision:payload.decision,decisionAt:now,duplicate:false,sync};
    });
    invalidate();
    res.status(result.duplicate?200:201).json(result);
  }catch(error){
    if(error?.code===11000)return res.status(409).json({message:'A satisfaction response was already recorded'});
    next(error);
  }finally{await session.endSession()}
});
router.post('/public/payment-proof',publicLimiter,proofUploadMiddleware,async(req,res,next)=>{
  const token=req.get('x-customer-satisfaction-token')||'';
  let stored=[];
  try{
    const completion=await findPublicCloseout(token);
    if(!completion)return res.status(410).json({message:'This customer closeout link is invalid, revoked, or expired'});
    if(!req.files?.length)return res.status(400).json({message:'Upload at least one transaction image'});
    if(req.files.some(file=>!validPhoto(file)))return res.status(400).json({message:'A payment-proof image does not match its declared file type'});
    const invoice=await CustomerInvoice.findById(completion.customerInvoiceId);
    const payment=await Payment.findOne({jobCompletionId:completion._id});
    if(!invoice||!payment)return res.status(409).json({message:'Invoice or Payment record is missing'});
    if(['received','completed'].includes(payment.status))return res.status(409).json({message:'This Payment has already been verified'});
    const instructions=invoice.paymentInstructionsSnapshot||{};
    const methodKey=cleanText(req.body.paymentMethod,50);
    const method=(instructions.paymentMethods||[]).find(item=>item.key===methodKey);
    if(!method)return res.status(400).json({message:'Choose an available payment method'});
    const payerName=cleanText(req.body.payerName,160);
    const transactionReference=cleanText(req.body.transactionReference,200);
    const customerNotes=cleanText(req.body.customerNotes,2000);
    const declaredAmount=Number(req.body.declaredAmount);
    const paidAt=new Date(req.body.paidAt);
    if(payerName.length<2)return res.status(400).json({message:'Payer name is required'});
    if(!Number.isFinite(declaredAmount)||declaredAmount<=0)return res.status(400).json({message:'Enter a valid paid amount'});
    if(Number.isNaN(paidAt.getTime())||paidAt>new Date(Date.now()+86400000))return res.status(400).json({message:'Enter a valid payment date'});
    if(method.transactionReferenceRequired&&transactionReference.length<2)return res.status(400).json({message:'Transaction reference is required for this payment method'});
    const uploader={id:`customer:${completion.customerId||completion._id}`,email:completion.customerSnapshot.email};
    stored=await storePhotos(req.files,completion,'payment_proof',uploader);
    const session=await mongoose.startSession();let result;
    try{
      await session.withTransaction(async()=>{
        const pending=await PaymentProofSubmission.findOne({paymentId:payment._id,status:'pending_review'}).session(session);
        if(pending)throw Object.assign(new Error('A payment proof is already awaiting review'),{status:409});
        const previous=await PaymentProofSubmission.findOne({paymentId:payment._id}).sort({revisionNumber:-1}).session(session);
        const proofReference=await nextPaymentProofReference(session);
        const [proof]=await PaymentProofSubmission.create([{
          proofReference,orderId:completion.orderId,customerInvoiceId:invoice._id,paymentId:payment._id,
          jobCompletionId:completion._id,customerId:completion.customerId,revisionNumber:(previous?.revisionNumber||0)+1,
          previousVersionId:previous?._id,paymentMethod:methodKey,payerName,declaredAmount,paidAt,
          transactionReference,customerNotes,proofImages:stored,submittedAt:new Date(),
          ipAddress:cleanText(req.ip,128),userAgent:cleanText(req.get('user-agent'),1000)
        }],{session});
        completion.paymentProofSubmissionId=proof._id;await completion.save({session});
        await Order.updateOne({_id:completion.orderId},{$set:{paymentProofSubmissionId:proof._id}},{session});
        await EmailOutbox.insertMany([
          {type:'customer_payment_proof_received',dedupeKey:`${proof._id}:customer_received`,recipients:[completion.customerSnapshot.email],payload:{customerName:completion.customerSnapshot.name,proofReference,invoiceNumber:invoice.invoiceNumber,amount:declaredAmount},orderId:completion.orderId,jobCompletionId:completion._id,customerInvoiceId:invoice._id,paymentProofSubmissionId:proof._id},
          {type:'staff_payment_proof_alert',dedupeKey:`${proof._id}:staff_alert`,recipients:staffEmails(),payload:{customerName:completion.customerSnapshot.name,proofReference,invoiceNumber:invoice.invoiceNumber,requestReference:completion.jobSnapshot.requestReference,amount:declaredAmount},orderId:completion.orderId,jobCompletionId:completion._id,customerInvoiceId:invoice._id,paymentProofSubmissionId:proof._id}
        ],{session});
        await notifyStaff(session,'Payment proof awaiting review',`${proofReference} was submitted for ${invoice.invoiceNumber}.`,'warning',completion.orderId,{paymentProofSubmissionId:proof._id});
        result=proof;
      });
      await markStoredLinked(stored);
      res.status(201).json({proofReference:result.proofReference,status:result.status,submittedAt:result.submittedAt});
    }finally{await session.endSession()}
  }catch(error){
    if(stored.length)await deleteStored(stored);
    if(error?.code===11000)return res.status(409).json({message:'A payment proof is already awaiting review'});
    next(error);
  }
});

router.use(authenticateToken,staffRoles);
router.get('/settings',async(_req,res,next)=>{try{res.json(await globalCloseoutSettings());}catch(error){next(error)}});
router.put('/settings',adminOnly,async(req,res,next)=>{
  try{
    const methods=Array.isArray(req.body.paymentMethods)?req.body.paymentMethods.slice(0,10).map(method=>({
      key:cleanText(method.key,50).toLowerCase().replace(/[^a-z0-9_-]+/g,'_'),
      label:cleanText(method.label,100),
      instructions:cleanText(method.instructions,4000),
      enabled:method.enabled!==false,
      transactionReferenceRequired:Boolean(method.transactionReferenceRequired)
    })).filter(method=>method.key&&method.label&&method.instructions):[];
    const update={
      paymentMethods:methods,
      remittanceContact:cleanText(req.body.remittanceContact,500),
      proofUploadInstructions:cleanText(req.body.proofUploadInstructions,2000),
      customerCloseoutEmailMessage:cleanText(req.body.customerCloseoutEmailMessage,3000),
      updatedBy:actorId(req)
    };
    res.json(await CloseoutSettings.findOneAndUpdate({key:'global'},{$set:update,$setOnInsert:{key:'global'}},{new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}));
  }catch(error){next(error)}
});
router.get('/orders',async(_req,res,next)=>{try{const orders=await Order.find({workflowStatus:{$in:['scheduled','awaiting_customer_closeout','completed','closeout_issue_reported']}}).populate('vendor','name email').sort({updatedAt:-1}).lean();const completions=await JobCompletion.find({orderId:{$in:orders.map(o=>o._id)}}).lean();const byOrder=new Map(completions.map(c=>[String(c.orderId),safeCompletion(c)]));res.json(orders.map(order=>({...order,completion:byOrder.get(String(order._id))||null})));}catch(error){next(error)}});
router.get('/orders/:orderId',async(req,res,next)=>{try{const order=await Order.findById(req.params.orderId).populate('vendor').lean();if(!order)return res.status(404).json({message:'Order not found'});const completion=await JobCompletion.findOne({orderId:order._id}).lean();const [invoice,decisions,proofs,messages]=await Promise.all([completion?.customerInvoiceId?CustomerInvoice.findById(completion.customerInvoiceId).populate('paymentId').lean():null,completion?CustomerSatisfactionDecision.find({jobCompletionId:completion._id}).sort({closeoutRevision:-1}).lean():[],completion?PaymentProofSubmission.find({jobCompletionId:completion._id}).sort({revisionNumber:-1}).lean():[],EmailOutbox.find({orderId:order._id,type:{$in:CLOSEOUT_TYPES}}).select('-payload').sort({createdAt:-1}).lean()]);const includeAudit=['admin','manager'].includes(req.user.role);if(!includeAudit)decisions.forEach(decision=>{delete decision.ipAddress;delete decision.userAgent});const paymentProofs=proofs.map(proof=>safePaymentProof(proof,includeAudit));res.json({order,completion:safeCompletion(completion),invoice,decision:decisions[0]||null,decisions,paymentProofs,emailMessages:messages});}catch(error){next(error)}});
router.post('/orders/:orderId/completion-link',async(req,res,next)=>{try{const {completion,token}=await ensureCompletion(req.params.orderId,{actorId:actorId(req),actorEmail:req.user.email});if(token)await EmailOutbox.create(completionLinkOutbox(completion,token));res.status(token?201:200).json(safeCompletion(completion));}catch(error){next(error)}});
router.post('/orders/:orderId/completion-link/resend',async(req,res,next)=>{try{const completion=await JobCompletion.findOne({orderId:req.params.orderId,status:'pending'}).select('+publicTokenHash');if(!completion)return res.status(409).json({message:'No active completion link exists'});const {completion:rotated,token}=await ensureCompletion(req.params.orderId,{rotate:true,actorId:actorId(req),actorEmail:req.user.email});await EmailOutbox.create(completionLinkOutbox(rotated,token));res.json(safeCompletion(rotated));}catch(error){next(error)}});
router.post('/orders/:orderId/completion-link/rotate',async(req,res,next)=>{try{const {completion,token}=await ensureCompletion(req.params.orderId,{rotate:true,actorId:actorId(req),actorEmail:req.user.email});await EmailOutbox.create(completionLinkOutbox(completion,token));res.json(safeCompletion(completion));}catch(error){next(error)}});
router.post('/orders/:orderId/completion-link/revoke',async(req,res,next)=>{try{const completion=await JobCompletion.findOne({orderId:req.params.orderId,status:'pending'}).select('+publicTokenHash');if(!completion)return res.status(409).json({message:'No pending completion link exists'});completion.publicTokenHash=undefined;completion.tokenRevokedAt=new Date();completion.history.push({action:'completion_link_revoked',actorType:'staff',actorId:actorId(req),actorEmail:req.user.email});await completion.save();res.json(safeCompletion(completion));}catch(error){next(error)}});
async function rotateCustomerCloseoutLink(req,res,next){
  const session=await mongoose.startSession();
  try{
    let response;
    await session.withTransaction(async()=>{
      const completion=await JobCompletion.findOne({orderId:req.params.orderId,status:'completed'}).session(session).select('+satisfactionTokenHash');
      if(!completion)throw Object.assign(new Error('A completed vendor submission is required'),{status:409});
      const [order,invoice]=await Promise.all([Order.findById(completion.orderId).session(session),CustomerInvoice.findById(completion.customerInvoiceId).session(session)]);
      if(!order||!invoice)throw new Error('Closeout records are incomplete');
      const token=generateToken();const now=new Date();
      completion.satisfactionTokenHash=hashToken(token);
      completion.satisfactionTokenExpiresAt=new Date(now.getTime()+SATISFACTION_TOKEN_TTL_MS);
      completion.closeoutTokenSentAt=now;completion.closeoutTokenRevokedAt=undefined;
      completion.history.push({action:'customer_closeout_link_rotated',actorType:'staff',actorId:actorId(req),actorEmail:req.user.email});
      await completion.save({session});
      const message=closeoutOutbox(completion,invoice,order,token,'customer_closeout_review',{dedupeKey:`${completion._id}:customer_closeout_review:r${completion.closeoutRevision}:${Date.now()}`});
      await EmailOutbox.create([message],{session});
      response=safeCompletion(completion);
    });
    res.json(response);
  }catch(error){next(error)}finally{await session.endSession()}
}
router.post('/orders/:orderId/closeout-link/resend',rotateCustomerCloseoutLink);
router.post('/orders/:orderId/closeout-link/rotate',rotateCustomerCloseoutLink);
router.post('/orders/:orderId/complete',uploadMiddleware,async(req,res,next)=>{try{let completion=await JobCompletion.findOne({orderId:req.params.orderId,status:'pending'}).select('+publicTokenHash +satisfactionTokenHash');if(!completion){const created=await ensureCompletion(req.params.orderId,{actorId:actorId(req),actorEmail:req.user.email});completion=created.completion}const result=await completeJob({completion,source:'staff',notes:cleanText(req.body.completionNotes),enteredName:'',beforeFiles:req.files?.beforePhotos||[],afterFiles:req.files?.afterPhotos||[],photoOverride:String(req.body.photoOverride)==='true',overrideReason:cleanText(req.body.photoOverrideReason,2000),actor:{id:actorId(req),email:req.user.email}});res.status(201).json({completion:safeCompletion(result.completion),invoice:result.invoice,payment:result.payment,sync:result.sync});}catch(error){next(error)}});
router.get('/invoices/:invoiceId/pdf',async(req,res,next)=>{try{const invoice=await CustomerInvoice.findById(req.params.invoiceId).lean();if(!invoice)return res.status(404).json({message:'Invoice not found'});const pdf=await createCustomerInvoicePdf(invoice);await CustomerInvoice.updateOne({_id:invoice._id},{$set:{pdfGeneratedAt:new Date()}});res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${invoice.invoiceNumber}.pdf"`,'Cache-Control':'private, no-store'});res.send(pdf);}catch(error){next(error)}});
router.get('/payment-proofs/:proofId/evidence/:documentId',async(req,res,next)=>{
  try{
    const proof=await PaymentProofSubmission.findById(req.params.proofId).lean();
    if(!proof)return res.status(404).json({message:'Payment proof not found'});
    const file=(proof.proofImages||[]).find(item=>item.status!=='deleted'&&item.documentId===req.params.documentId);
    if(!file?.fileId)return res.status(404).json({message:'Payment proof image not found'});
    res.set({
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Type':file.type||'application/octet-stream',
      'Content-Disposition':`inline; filename="${String(file.name||'payment-proof').replace(/["\r\n]/g,'_')}"`
    });
    const stream=new GridFSBucket(mongoose.connection.db,{bucketName:'uploads'}).openDownloadStream(file.fileId);
    stream.once('error',error=>{if(!res.headersSent)next(error);else res.destroy(error)});
    stream.pipe(res);
  }catch(error){next(error)}
});
router.post('/satisfaction/:decisionId/resolve',async(req,res,next)=>{
  const note=cleanText(req.body.resolutionNote,3000);if(note.length<10)return res.status(400).json({message:'Resolution note must contain at least 10 characters'});
  const session=await mongoose.startSession();
  try{
    let resolved;
    let sync;
    await session.withTransaction(async()=>{
      const decision=await CustomerSatisfactionDecision.findOne({_id:req.params.decisionId,decision:'issue_reported',resolvedAt:{$exists:false}}).session(session);
      if(!decision)throw Object.assign(new Error('Only an unresolved reported issue can be resolved'),{status:409});
      decision.resolvedAt=new Date();decision.resolvedBy=actorId(req);decision.resolutionNote=note;await decision.save({session});
      const order=await Order.findById(decision.orderId).session(session);
      if(!order)throw new Error('The closeout Order is missing');
      const completion=await JobCompletion.findById(decision.jobCompletionId).session(session).select('+satisfactionTokenHash');
      const invoice=await CustomerInvoice.findById(decision.customerInvoiceId).session(session);
      if(!completion||!invoice)throw new Error('The closeout records are missing');
      const token=generateToken();const now=new Date();
      completion.closeoutRevision=(completion.closeoutRevision||1)+1;
      completion.satisfactionDecisionId=undefined;
      completion.satisfactionTokenHash=hashToken(token);
      completion.satisfactionTokenExpiresAt=new Date(now.getTime()+SATISFACTION_TOKEN_TTL_MS);
      completion.closeoutTokenSentAt=now;completion.closeoutTokenRevokedAt=undefined;
      completion.history.push({action:'closeout_issue_resolved_reconfirmation_requested',actorType:'staff',actorId:actorId(req),actorEmail:req.user.email,message:note});
      await completion.save({session});
      order.satisfactionStatus='pending';order.satisfactionDecisionId=undefined;order.completedAt=undefined;order.completedBy=undefined;
      sync=await synchronizeWorkflowOrder(order,'awaiting_customer_closeout',{session});
      await EmailOutbox.create([
        closeoutOutbox(completion,invoice,order,token,'customer_closeout_issue_resolved',{payload:{resolutionNote:note},satisfactionDecisionId:decision._id}),
        {type:'staff_closeout_issue_resolved',dedupeKey:`${decision._id}:resolved`,recipients:staffEmails(),payload:{completionReference:completion.completionReference,requestReference:order.requestReference,resolutionNote:note},orderId:order._id,jobCompletionId:decision.jobCompletionId,customerInvoiceId:decision.customerInvoiceId,satisfactionDecisionId:decision._id}
      ],{session});
      await notifyStaff(session,'Closeout reconfirmation requested',`${order.requestReference||order.orderId} was resolved and returned to the customer for confirmation.`,'success',order._id,{jobCompletionId:decision.jobCompletionId,satisfactionDecisionId:decision._id});
      resolved=decision;
    });
    invalidate();res.json({...resolved.toObject(),sync});
  }catch(error){next(error)}finally{await session.endSession()}
});
router.post('/payment-proofs/:proofId/verify',async(req,res,next)=>{
  const session=await mongoose.startSession();
  try{
    let result;
    await session.withTransaction(async()=>{
      const proof=await PaymentProofSubmission.findOne({_id:req.params.proofId,status:'pending_review'}).session(session);
      if(!proof)throw Object.assign(new Error('Only a pending payment proof can be verified'),{status:409});
      const [payment,order,completion,invoice]=await Promise.all([
        Payment.findById(proof.paymentId).session(session),
        Order.findById(proof.orderId).session(session),
        JobCompletion.findById(proof.jobCompletionId).session(session),
        CustomerInvoice.findById(proof.customerInvoiceId).session(session)
      ]);
      if(!payment||!order||!completion||!invoice)throw new Error('Payment proof records are incomplete');
      if(Math.abs(Number(proof.declaredAmount)-Number(payment.amount))>0.009)throw Object.assign(new Error('The submitted amount does not match the invoice total; reject the proof or correct the Payment before verification'),{status:409});
      const now=new Date();
      proof.status='verified';proof.verifiedAt=now;proof.verifiedBy=actorId(req);await proof.save({session});
      const knownMethods=['cash','credit-card','debit-card','bank-transfer','check','online'];
      payment.status='received';payment.paymentMethod=knownMethods.includes(proof.paymentMethod)?proof.paymentMethod:'online';
      payment.transactionId=proof.transactionReference;payment.paymentDate=proof.paidAt;payment.processedBy=actorId(req);payment.paymentProofSubmissionId=proof._id;
      await payment.save({session});
      completion.paymentProofSubmissionId=proof._id;await completion.save({session});
      order.paymentProofSubmissionId=proof._id;const sync=await synchronizePaymentStage(order,{session});
      await EmailOutbox.create([{
        type:'customer_payment_proof_verified',dedupeKey:`${proof._id}:verified`,recipients:[completion.customerSnapshot.email],
        payload:{customerName:completion.customerSnapshot.name,proofReference:proof.proofReference,invoiceNumber:invoice.invoiceNumber,amount:proof.declaredAmount},
        orderId:order._id,jobCompletionId:completion._id,customerInvoiceId:invoice._id,paymentProofSubmissionId:proof._id
      }],{session});
      result={proof,payment,sync};
    });
    invalidate();res.json(result);
  }catch(error){next(error)}finally{await session.endSession()}
});
router.post('/payment-proofs/:proofId/reject',async(req,res,next)=>{
  const reason=cleanText(req.body.rejectionReason,2000);
  if(reason.length<10)return res.status(400).json({message:'Rejection reason must contain at least 10 characters'});
  const session=await mongoose.startSession();
  try{
    let result;
    await session.withTransaction(async()=>{
      const proof=await PaymentProofSubmission.findOne({_id:req.params.proofId,status:'pending_review'}).session(session);
      if(!proof)throw Object.assign(new Error('Only a pending payment proof can be rejected'),{status:409});
      const [completion,invoice]=await Promise.all([JobCompletion.findById(proof.jobCompletionId).session(session),CustomerInvoice.findById(proof.customerInvoiceId).session(session)]);
      if(!completion||!invoice)throw new Error('Payment proof records are incomplete');
      proof.status='rejected';proof.rejectedAt=new Date();proof.rejectedBy=actorId(req);proof.rejectionReason=reason;await proof.save({session});
      await EmailOutbox.create([{
        type:'customer_payment_proof_rejected',dedupeKey:`${proof._id}:rejected`,recipients:[completion.customerSnapshot.email],
        payload:{customerName:completion.customerSnapshot.name,proofReference:proof.proofReference,invoiceNumber:invoice.invoiceNumber,rejectionReason:reason},
        orderId:proof.orderId,jobCompletionId:completion._id,customerInvoiceId:invoice._id,paymentProofSubmissionId:proof._id
      }],{session});
      result=proof;
    });
    res.json(result);
  }catch(error){next(error)}finally{await session.endSession()}
});
router.post('/outbox/:messageId/retry',async(req,res,next)=>{try{const message=await EmailOutbox.findOne({_id:req.params.messageId,type:{$in:CLOSEOUT_TYPES},status:'permanently_failed'});if(!message)return res.status(409).json({message:'Only a permanently failed closeout email can be retried'});Object.assign(message,{status:'pending',attempts:0,nextAttemptAt:new Date(),lockedUntil:undefined,lockedBy:undefined,lastErrorCategory:undefined});await message.save();res.json({success:true});}catch(error){next(error)}});
router.use((error,_req,res,_next)=>{console.error('Closeout error:',error?.name||'Error',error?.message||'');res.status(error.status||(['ValidationError','CastError'].includes(error.name)?400:500)).json({message:error.message||'Closeout request failed'});});

module.exports=router;
module.exports.__test={validPhoto};
