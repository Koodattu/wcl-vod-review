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
    boss?: number;
    difficulty?: number;
    kill?: boolean;
    percentage?: number;
    fightPercentage?: number;
    lastPhaseForPercentageDisplay?: number;
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
    boss: { type: Number },
    difficulty: { type: Number },
    kill: { type: Boolean },
    percentage: { type: Number },
    fightPercentage: { type: Number },
    lastPhaseForPercentageDisplay: { type: Number },
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

// Models
export const Report = mongoose.model<ReportDocument>("Report", ReportSchema);
export const Event = mongoose.model<EventDocument>("Event", EventSchema);
export const CachedEvents = mongoose.model<CachedEventsDocument>("CachedEvents", CachedEventsSchema);
