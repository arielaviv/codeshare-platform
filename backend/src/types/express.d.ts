import mongoose from 'mongoose';

declare global {
  namespace Express {
    interface User {
      _id: mongoose.Types.ObjectId;
      username: string;
      email: string;
      password?: string;
      googleId?: string;
      profileImage?: string;
      bio?: string;
      refreshToken?: string;
      createdAt: Date;
      updatedAt: Date;
      comparePassword(candidatePassword: string): Promise<boolean>;
    }
  }
}

export {};
