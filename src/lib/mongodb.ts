import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required in .env.local");
}

declare global {
  // eslint-disable-next-line no-var
  var moonbarMongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise =
  global.moonbarMongoClientPromise ?? new MongoClient(uri).connect();

if (process.env.NODE_ENV !== "production") {
  global.moonbarMongoClientPromise = clientPromise;
}

export async function getDb() {
  const client = await clientPromise;
  return client.db();
}
