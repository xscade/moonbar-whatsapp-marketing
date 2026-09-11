import { ObjectId } from "mongodb";
import * as XLSX from "xlsx";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/whatsapp";

const phoneHeaders = ["phone", "mobile", "whatsapp", "number", "contact"];
const nameHeaders = ["name", "customer", "contact name", "full name"];
const sourceHeaders = ["source", "file", "campaign"];
const tagHeaders = ["tag", "tags"];

function normalizedHeader(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getHeaderIndex(headers: unknown[], candidates: string[]) {
  return headers.findIndex((header) => {
    const normalized = normalizedHeader(header);
    return candidates.some((candidate) => normalized.includes(candidate));
  });
}

function splitTags(value: unknown) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function findPhoneInRow(row: unknown[]) {
  for (const value of row) {
    const phone = normalizePhone(String(value || ""));
    if (phone.length >= 8) return phone;
  }
  return "";
}

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");
    const listId = String(formData.get("listId") || "");

    if (!(file instanceof File)) return error("Upload an Excel or CSV file", 422);
    if (listId && !ObjectId.isValid(listId)) return error("Invalid list", 422);

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return error("The spreadsheet has no sheets", 422);

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: ""
    });
    if (!rows.length) return error("The spreadsheet is empty", 422);

    const headers = rows[0] || [];
    const phoneIndex = getHeaderIndex(headers, phoneHeaders);
    const nameIndex = getHeaderIndex(headers, nameHeaders);
    const sourceIndex = getHeaderIndex(headers, sourceHeaders);
    const tagIndex = getHeaderIndex(headers, tagHeaders);
    const hasHeader = phoneIndex >= 0 || nameIndex >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const db = await getDb();
    const now = new Date();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of dataRows) {
      const phone =
        phoneIndex >= 0
          ? normalizePhone(String(row[phoneIndex] || ""))
          : findPhoneInRow(row);

      if (phone.length < 8) {
        skipped += 1;
        continue;
      }

      const name =
        nameIndex >= 0
          ? String(row[nameIndex] || "").trim()
          : String(row.find((value) => !String(value || "").match(/\d{8,}/)) || "").trim();
      const source =
        sourceIndex >= 0
          ? String(row[sourceIndex] || "").trim()
          : file.name;
      const tags = normalizeTags([
        ...(tagIndex >= 0 ? splitTags(row[tagIndex]) : []),
        "imported"
      ]);
      const listIds = listId ? [listId] : [];
      const setFields: Record<string, unknown> = {
        phone,
        source,
        consentStatus: "subscribed",
        updatedAt: now
      };

      if (name) setFields.name = name;

      const result = await db.collection("contacts").updateOne(
        { phone },
        {
          $set: setFields,
          $addToSet: {
            tags: { $each: tags },
            listIds: { $each: listIds }
          },
          $setOnInsert: {
            name: name || `Guest ${phone.slice(-4)}`,
            notes: "",
            createdAt: now
          }
        },
        { upsert: true }
      );

      if (result.upsertedId) created += 1;
      else updated += 1;
    }

    return json({ created, updated, skipped });
  } catch (err) {
    return handleRouteError(err);
  }
}
