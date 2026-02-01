import mongoose, { Document, Schema } from "mongoose";

// Simplified document types
export interface ReportDocument extends Document {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  owner: { name: string };
  fights: {
    id: number;
    name: string;
    startTime: number;
    endTime: number;
    encounterID?: number;
    journalID?: number;
    difficulty?: number;
    kill?: boolean;
    fightPercentage?: number;
    lastPhase?: number;
  }[];
  lastUpdated: Date;
  lastFightCount: number;
}

export interface EventDocument extends Document {
  reportCode: string;
  fightId: number;
  timestamp: number;
  type: "Deaths" | "Casts";
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  stack?: number;
  hitType?: number;
  amount?: number;
  mitigated?: number;
  unmitigatedAmount?: number;
  ability?: { name: string; guid: number; type: number };
  data?: any;
  // Enhanced data
  abilityInfo?: {
    gameID: number;
    name: string;
    icon: string;
    type?: number;
  };
  sourceInfo?: {
    id: number;
    name: string;
    type: string;
    subType?: string;
    server?: string;
    icon?: string;
    petOwner?: number;
  };
  targetInfo?: {
    id: number;
    name: string;
    type: string;
    subType?: string;
    server?: string;
    icon?: string;
    petOwner?: number;
  };
}

export interface CachedEventsDocument extends Document {
  reportCode: string;
  fightId: number;
  startTime: number;
  endTime: number;
  events: EventDocument[];
  lastUpdated: Date;
}

// Schemas
const FightSchema = new Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    encounterID: { type: Number },
    journalID: { type: Number },
    difficulty: { type: Number },
    kill: { type: Boolean },
    fightPercentage: { type: Number },
    lastPhase: { type: Number },
  },
  { _id: false }
);

const ReportSchema = new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number, required: true },
  owner: {
    name: { type: String, required: true },
  },
  fights: [FightSchema],
  lastUpdated: { type: Date, default: Date.now },
  lastFightCount: { type: Number, default: 0 },
});

const EventSchema = new Schema({
  reportCode: { type: String, required: true },
  fightId: { type: Number, required: true },
  timestamp: { type: Number, required: true },
  type: { type: String, required: true, enum: ["Deaths", "Casts"] },
  sourceID: { type: Number },
  targetID: { type: Number },
  abilityGameID: { type: Number },
  stack: { type: Number },
  hitType: { type: Number },
  amount: { type: Number },
  mitigated: { type: Number },
  unmitigatedAmount: { type: Number },
  ability: {
    name: { type: String },
    guid: { type: Number },
    type: { type: Number },
  },
  data: { type: Schema.Types.Mixed },
  // Enhanced data
  abilityInfo: {
    gameID: { type: Number },
    name: { type: String },
    icon: { type: String },
    type: { type: Number },
  },
  sourceInfo: {
    id: { type: Number },
    name: { type: String },
    type: { type: String },
    subType: { type: String },
    server: { type: String },
    icon: { type: String },
    petOwner: { type: Number },
  },
  targetInfo: {
    id: { type: Number },
    name: { type: String },
    type: { type: String },
    subType: { type: String },
    server: { type: String },
    icon: { type: String },
    petOwner: { type: Number },
  },
});

const CachedEventsSchema = new Schema({
  reportCode: { type: String, required: true },
  fightId: { type: Number, required: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number, required: true },
  events: [EventSchema],
  lastUpdated: { type: Date, default: Date.now },
});

// Add indexes (removed duplicate index on code since it's already unique)
EventSchema.index({ reportCode: 1, fightId: 1, timestamp: 1 });
CachedEventsSchema.index({ reportCode: 1, fightId: 1, startTime: 1, endTime: 1 });

// Auth Token models - stores tokens for both Blizzard and WCL APIs
export interface AuthTokenDocument extends Document {
  service: "blizzard" | "wcl";
  accessToken: string;
  tokenType: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AchievementDocument extends Document {
  id: number;
  name: string;
  href: string;
  lastUpdated: Date;
}

export interface BossIconDocument extends Document {
  bossName: string;
  iconUrl: string;
  achievementId: number;
  lastUpdated: Date;
}

export interface AchievementUpdateLogDocument extends Document {
  lastFullUpdate: Date;
  attemptCount: number;
}

// Video metadata cache
export interface VideoDocument extends Document {
  platform: "youtube" | "twitch";
  videoId: string;
  title: string;
  description: string;
  publishedAt?: string; // YouTube uses publishedAt
  createdAt?: string; // Twitch uses createdAt
  channelId?: string; // YouTube
  channelTitle?: string; // YouTube
  url?: string; // Twitch
  thumbnailUrl?: string; // Twitch
  duration?: number; // Duration in seconds
  viewCount?: number; // Twitch
  userName?: string; // Twitch
  userLogin?: string; // Twitch
  lastUpdated: Date;
}

// Auth Token schema - stores tokens for both Blizzard and WCL APIs
const AuthTokenSchema = new Schema({
  service: { type: String, required: true, enum: ["blizzard", "wcl"] },
  accessToken: { type: String, required: true },
  tokenType: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

const AchievementSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  href: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

const BossIconSchema = new Schema({
  bossName: { type: String, required: true, unique: true },
  iconUrl: { type: String, required: true },
  achievementId: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

const AchievementUpdateLogSchema = new Schema({
  lastFullUpdate: { type: Date, required: true },
  attemptCount: { type: Number, default: 0 },
});

// Video metadata cache schema
const VideoSchema = new Schema({
  platform: { type: String, required: true, enum: ["youtube", "twitch"] },
  videoId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  publishedAt: { type: String }, // YouTube
  createdAt: { type: String }, // Twitch
  channelId: { type: String }, // YouTube
  channelTitle: { type: String }, // YouTube
  url: { type: String }, // Twitch
  thumbnailUrl: { type: String }, // Twitch
  duration: { type: Number }, // Duration in seconds
  viewCount: { type: Number }, // Twitch
  userName: { type: String }, // Twitch
  userLogin: { type: String }, // Twitch
  lastUpdated: { type: Date, default: Date.now },
});

// Add indexes for Blizzard API collections
AchievementSchema.index({ name: "text" }); // For text search
// Note: id and bossName indexes are already created by unique: true

// Add compound unique index for videos
VideoSchema.index({ platform: 1, videoId: 1 }, { unique: true });

// Add unique index for auth tokens - one token per service
AuthTokenSchema.index({ service: 1 }, { unique: true });

// Models
export const Report = mongoose.model<ReportDocument>("Report", ReportSchema);
export const Event = mongoose.model<EventDocument>("Event", EventSchema);
export const CachedEvents = mongoose.model<CachedEventsDocument>("CachedEvents", CachedEventsSchema);
export const AuthToken = mongoose.model<AuthTokenDocument>("AuthToken", AuthTokenSchema);
export const Achievement = mongoose.model<AchievementDocument>("Achievement", AchievementSchema);
export const BossIcon = mongoose.model<BossIconDocument>("BossIcon", BossIconSchema);
export const AchievementUpdateLog = mongoose.model<AchievementUpdateLogDocument>("AchievementUpdateLog", AchievementUpdateLogSchema);
export const Video = mongoose.model<VideoDocument>("Video", VideoSchema);
