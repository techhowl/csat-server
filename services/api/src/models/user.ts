import { Schema, model, Document, Types } from "mongoose";

// Interface for the User document
export interface IUser extends Document {
  // Basic Information
  name: string;
  email: string;
  mobileNumber?: string;
  profileImage?: string;

  // Authentication
  password?: string;
  provider: "local" | "google";

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
      match: [
        /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/,
        "Please provide a valid email address",
      ],
    },
    
    mobileNumber: {
      type: String,
      trim: true,
      sparse: true, // Allows multiple null values while maintaining uniqueness for non-null values
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
  },
  {
    // Enable automatic timestamps
    timestamps: true,
    
    // Configure toJSON transformation
    toJSON: {
      transform: function (_doc, ret) {
        // Create a new object without sensitive fields
        const { password, __v, ...cleanedRet } = ret;
        return cleanedRet;
      },
    },
  }
);

// Indexes for performance
// Compound index for _id is automatically created by MongoDB
UserSchema.index({ email: 1 }); // For unique email lookups
UserSchema.index({ name: 1 }); // For name-based searches
UserSchema.index({ provider: 1, email: 1 }); // For provider-specific lookups
UserSchema.index({ "accessScopes.resourceType": 1, "accessScopes.resourceId": 1 }); // For access scope queries
UserSchema.index({ isActive: 1 }); // For filtering active users

// Export the User model
export const User = model<IUser>("User", UserSchema);
