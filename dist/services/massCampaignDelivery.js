import { MassCampaign } from "../models/MassCampaign.js";
function extractMetaErrorReason(errors) {
  const arr = Array.isArray(errors) ? errors : [];
  const first = arr[0];
  const raw = String(first?.message ?? first?.title ?? "").trim() || (first?.code != null ? `Código ${first.code}` : "") || JSON.stringify(first ?? {}).slice(0, 280);
  return raw.slice(0, 500);
}
export function computeDeliveryStatsFromRows(rowResults) {
  const rows = Array.isArray(rowResults) ? rowResults : [];
  let sentCount = 0;
  let failCount = 0;
  let deliveredCount = 0;
  let deliveryFailedCount = 0;
  let pendingDeliveryCount = 0;
  for (const r of rows) {
    const wamid = String(r.wamid ?? "").trim();
    const st = String(r.deliveryStatus ?? "").toLowerCase();
    const ok = r.ok;
    if (!wamid) {
      if (ok === false || r.apiOk === false)
        failCount += 1;
      continue;
    }
    sentCount += 1;
    if (ok === true || st === "delivered" || st === "read")
      deliveredCount += 1;
    else if (ok === false || st === "failed")
      deliveryFailedCount += 1;
    else
      pendingDeliveryCount += 1;
  }
  return { sentCount, failCount, deliveredCount, deliveryFailedCount, pendingDeliveryCount };
}
function deliveryProgressRank(r) {
  const st = String(r.deliveryStatus ?? "").toLowerCase();
  const wid = String(r.wamid ?? "").trim();
  if (st === "failed" || r.ok === false && wid)
    return 4;
  if (st === "read" || st === "delivered" || r.ok === true)
    return 3;
  if (st === "sent")
    return 2;
  if (!st || st === "pending")
    return 1;
  return 2;
}
export function mergeIncomingRowResultsWithExisting(existingRows, incomingRows) {
  const existing = Array.isArray(existingRows) ? existingRows : [];
  const exMap = /* @__PURE__ */ new Map();
  for (const r of existing) {
    const idx = Math.floor(Number(r.rowIndex));
    if (Number.isFinite(idx) && idx >= 1)
      exMap.set(idx, r);
  }
  const out = [];
  const incomingIndices = /* @__PURE__ */ new Set();
  for (const inc of incomingRows) {
    const idx = Math.floor(Number(inc.rowIndex));
    if (!Number.isFinite(idx) || idx < 1)
      continue;
    incomingIndices.add(idx);
    const ex = exMap.get(idx);
    if (!ex) {
      out.push(inc);
      continue;
    }
    const rex = deliveryProgressRank(ex);
    const rinc = deliveryProgressRank(inc);
    if (rex > rinc) {
      out.push({
        ...inc,
        deliveryStatus: ex.deliveryStatus,
        deliveryUpdatedAt: ex.deliveryUpdatedAt,
        ok: ex.ok,
        reason: ex.reason
      });
    } else if (rinc > rex) {
      out.push({ ...ex, ...inc });
    } else {
      const tex = new Date(String(ex.deliveryUpdatedAt ?? "")).getTime();
      const tin = new Date(String(inc.deliveryUpdatedAt ?? "")).getTime();
      const exT = Number.isFinite(tex);
      const inT = Number.isFinite(tin);
      if (inT && exT && tin > tex)
        out.push({ ...ex, ...inc });
      else if (inT && !exT)
        out.push({ ...ex, ...inc });
      else
        out.push({
          ...inc,
          deliveryStatus: ex.deliveryStatus,
          deliveryUpdatedAt: ex.deliveryUpdatedAt,
          ok: ex.ok,
          reason: ex.reason
        });
    }
  }
  for (const [idx, ex] of exMap) {
    if (!incomingIndices.has(idx))
      out.push(ex);
  }
  out.sort((a, b) => Math.floor(Number(a.rowIndex)) - Math.floor(Number(b.rowIndex)));
  return out;
}
async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function findCampaignWithWamid(companyId, wid) {
  let doc = await MassCampaign.findOne({
    companyId,
    rowResults: { $elemMatch: { wamid: wid } }
  }).select({ _id: 1 }).lean();
  if (doc?._id)
    return doc;
  await sleep(400);
  doc = await MassCampaign.findOne({
    companyId,
    rowResults: { $elemMatch: { wamid: wid } }
  }).select({ _id: 1 }).lean();
  if (doc?._id)
    return doc;
  await sleep(1200);
  return MassCampaign.findOne({
    companyId,
    rowResults: { $elemMatch: { wamid: wid } }
  }).select({ _id: 1 }).lean();
}
export async function syncMassCampaignRowFromWebhook(companyId, wamid, statusRaw, errors, ts) {
  const wid = String(wamid ?? "").trim();
  if (!wid)
    return;
  const statusLower = String(statusRaw ?? "").toLowerCase();
  const errArr = Array.isArray(errors) ? errors : [];
  const hasErr = errArr.length > 0;
  let okBool;
  if (statusLower === "failed" || hasErr)
    okBool = false;
  else if (statusLower === "delivered" || statusLower === "read")
    okBool = true;
  const reasonTxt = okBool === false ? extractMetaErrorReason(errArr) : void 0;
  const campaign = await findCampaignWithWamid(companyId, wid);
  if (!campaign?._id)
    return;
  const setOps = {
    "rowResults.$[el].deliveryStatus": statusRaw,
    "rowResults.$[el].deliveryUpdatedAt": ts
  };
  const unsetOps = {};
  if (okBool === false) {
    setOps["rowResults.$[el].ok"] = false;
    setOps["rowResults.$[el].reason"] = reasonTxt ?? "Entrega fallida";
  } else if (okBool === true) {
    setOps["rowResults.$[el].ok"] = true;
    unsetOps["rowResults.$[el].reason"] = "";
  } else {
    unsetOps["rowResults.$[el].ok"] = "";
    unsetOps["rowResults.$[el].reason"] = "";
  }
  const updatePayload = { $set: setOps };
  if (Object.keys(unsetOps).length)
    updatePayload.$unset = unsetOps;
  await MassCampaign.updateOne({ _id: campaign._id }, updatePayload, {
    arrayFilters: [{ "el.wamid": wid }]
  });
  const fresh = await MassCampaign.findById(campaign._id).lean();
  const stats = computeDeliveryStatsFromRows(fresh?.rowResults ?? []);
  await MassCampaign.updateOne({ _id: campaign._id }, { $set: stats });
}
