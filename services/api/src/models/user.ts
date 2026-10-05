import { Schema, model, Document, Types } from "mongoose";
import { z } from "zod";

// Interface for the User document
export interface IUser extends Document {
  // Basic Information
  name: string;
  email: string;
  mobileNumber?: string;
  profileImage?: string;

  // Authentication
  password?: string;
  // How the account was CREATED. A local account that later links Google keeps
  // "local"; check `googleId` / `password` for the methods it can use now.
  provider: "local" | "google";
  // Google's stable account ID (`sub` claim). Set once Google is linked.
  googleId?: string;

  // Authorization
  role: "admin" | "user";

  // Resource Level Access
  accessScopes: Array<{
    resourceType: "sbu" | "department";
    resourceId: Types.ObjectId;
  }>;

  // Account Status
  isActive: boolean;
  lastLoginAt?: Date;
  // When all sessions were last revoked on purpose (logout-all, Google
  // linking). Refresh tokens issued before this are "revoked", not "reused".
  sessionsRevokedAt?: Date;

  // Timestamps (automatically added by Mongoose)
  createdAt: Date;
  updatedAt: Date;
}

// Define the access scope sub-schema
const AccessScopeSchema = new Schema(
  {
    // Type of resource this scope grants access to
    resourceType: {
      type: String,
      enum: ["sbu", "department"],
      required: true,
    },
    // ID of the specific resource
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    // Disable _id for subdocuments to keep it cleaner
    _id: false,
  }
);

// Define the main User schema
const UserSchema = new Schema<IUser>(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      // Same regex the signup DTO validates with (z.email()), so any address
      // the API accepts can be persisted — e.g. "user+tag@example.com". A
      // stricter model rule would fail inside Mongoose and surface as a 500.
      match: [z.regexes.email, "Please provide a valid email address"],
    },

    mobileNumber: {
      type: String,
      trim: true,
    },

    profileImage: {
      type: String,
      default: null,
    },

    // Authentication
    password: {
      type: String,
      default: null,
      select: false, // Exclude from queries by default
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    // Users are matched by this, not by email (emails can change; `sub` can't).
    // Sparse: the unique index ignores the many users without Google linked.
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Authorization
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },

    // Resource Level Access
    accessScopes: {
      type: [AccessScopeSchema],
      default: [],
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    sessionsRevokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    // Enable automatic timestamps
    timestamps: true,

    // Configure toJSON transformation
    toJSON: {
      transform: function (_doc, ret) {
        // Strip sensitive fields; bind to underscore-prefixed names so the
        // unused-vars rule is satisfied while still excluding them from output.
        const { password: _password, __v: _version, ...cleanedRet } = ret;
        return cleanedRet;
      },
    },
  }
);

// Indexes for performance
// Compound index for _id is automatically created by MongoDB
// Note: email is already indexed via `unique: true` on the field definition.
UserSchema.index({ name: 1 }); // For name-based searches
UserSchema.index({ provider: 1, email: 1 }); // For provider-specific lookups
UserSchema.index({
  "accessScopes.resourceType": 1,
  "accessScopes.resourceId": 1,
}); // For access scope queries
UserSchema.index({ isActive: 1 }); // For filtering active users

// Export the User model
export const User = model<IUser>("User", UserSchema);
