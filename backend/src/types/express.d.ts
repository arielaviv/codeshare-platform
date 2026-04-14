import mongoose from 'mongoose';
import type { ComputerSessionRecord } from '../services/computer/types';

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
      creditsCents: number;
      hasClaimedWelcomeBonus: boolean;
      milestonesClaimed: string[];
      createdAt: Date;
      updatedAt: Date;
      comparePassword(candidatePassword: string): Promise<boolean>;
    }

    interface Request {
      computerSession?: ComputerSessionRecord;
    }
  }
}

export {};
