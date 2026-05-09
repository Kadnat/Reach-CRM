import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI!;
let client: MongoClient;
let db: Db;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri);
    await global._mongoClient.connect();
  }
  client = global._mongoClient;
  db = client.db("reach_crm");
  return db;
}
