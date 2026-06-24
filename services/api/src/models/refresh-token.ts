import { Schema, model, Document, Types } from "mongoose";

// Interface for the RefreshToken document
export interface IRefreshToken extends Document {
  // Reference to the User who owns this token
  userId: Types.ObjectId;
  
  // SHA-256 hash of the actual refresh token for secure storage
  tokenHash: string;
  
  // Expiration timestamp - MongoDB will auto-delete after this time
  expiresAt: Date;
  
  // Timestamps (automatically managed by Mongoose)
  createdAt: Date;
  updatedAt: Date;
}

// Define the RefreshToken schema
const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    // User reference - who owns this refresh token
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true, // Index for fast lookups by user
    },

    // SHA-256 hash of the actual refresh token
    // We store the hash, not the token itself for security
    tokenHash: {
      type: String,
      required: [true, "Token hash is required"],
      unique: true, // Ensure no duplicate tokens
      index: true, // Index for fast token lookups
    },

    // Expiration date/time for this token
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
      index: true, // Index for TTL functionality
    },
  },
  {
    // Enable automatic timestamps (createdAt, updatedAt)
    timestamps: true,
    
    // Configure toJSON to clean up output
    toJSON: {
      transform: function (_doc, ret) {
        // Remove version key
        const { __v, ...cleaned } = ret;
        return cleaned;
      },
    },
  }
);

// TTL (Time To Live) Index
// MongoDB will automatically delete documents where expiresAt < current time
// expireAfterSeconds: 0 means use the date in expiresAt field directly
RefreshTokenSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    name: "expiresAt_ttl", // Named index for easier management
  }
);

// Compound index for efficient queries when finding user's active tokens
// Useful for logout-all-devices functionality
RefreshTokenSchema.index(
  { userId: 1, expiresAt: 1 },
  {
    name: "userId_expiresAt_compound",
  }
);

// Static method to clean up expired tokens for a user (optional backup to TTL)
RefreshTokenSchema.statics.cleanupExpiredTokens = async function(userId?: Types.ObjectId) {
  const query = { 
    expiresAt: { $lt: new Date() },
    ...(userId && { userId })
  };
  return this.deleteMany(query);
};

// Instance method to check if token is expired
RefreshTokenSchema.methods.isExpired = function(): boolean {
  return this.expiresAt < new Date();
};

// Export the RefreshToken model
export const RefreshToken = model<IRefreshToken>("RefreshToken", RefreshTokenSchema);
