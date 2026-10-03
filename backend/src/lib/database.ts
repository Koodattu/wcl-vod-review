import mongoose from "mongoose";

export class Database {
  private static instance: Database;

  private constructor() {
    mongoose.connection.on("error", () => console.error("MongoDB connection error"));
    mongoose.connection.on("disconnected", () => console.log("MongoDB disconnected"));
  }

  public static getInstance(): Database {
    if (!Database.instance) Database.instance = new Database();
    return Database.instance;
  }

  public async connect(): Promise<void> {
    if (mongoose.connection.readyState === 1) return;
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/wcl_vod_review";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");
  }

  public async disconnect(): Promise<void> {
    // Also close a disconnected client's reconnect loop during shutdown.
    await mongoose.disconnect();
  }

  public getConnectionState(): boolean {
    return mongoose.connection.readyState === 1;
  }
}
