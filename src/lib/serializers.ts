import { ObjectId, WithId } from "mongodb";

export function toObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid id");
  }
  return new ObjectId(id);
}

export function serializeDoc<T extends Record<string, unknown>>(doc: WithId<T>) {
  return {
    ...doc,
    _id: doc._id.toString()
  };
}

export function serializeDocs<T extends Record<string, unknown>>(
  docs: Array<WithId<T>>
) {
  return docs.map(serializeDoc);
}
