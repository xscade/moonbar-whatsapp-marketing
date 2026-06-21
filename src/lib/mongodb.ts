import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var moonbarMongoClientPromise: Promise<MongoClient> | undefined;
}

function getMongoClientPromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!global.moonbarMongoClientPromise) {
    global.moonbarMongoClientPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000
    }).connect();
  }

  return global.moonbarMongoClientPromise;
}

export async function getDb() {
  const client = await getMongoClientPromise();
  return client.db();
}
