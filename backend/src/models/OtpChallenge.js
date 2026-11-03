import mongoose from 'mongoose';

const otpChallengeSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  codeHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0
  },
  attemptsUsed: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  }
}, { timestamps: true });

const OtpChallenge = mongoose.model('OtpChallenge', otpChallengeSchema);

export default OtpChallenge;
