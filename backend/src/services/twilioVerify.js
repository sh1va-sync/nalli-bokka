import twilio from 'twilio';
import AppError from '../utils/AppError.js';

function getVerifyClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw new AppError(503, 'Phone verification is not configured');
  }

  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    .verify.v2.services(TWILIO_VERIFY_SERVICE_SID);
}

const twilioVerify = {
  async send(phone) {
    const service = getVerifyClient();
    await service.verifications.create({ to: phone, channel: 'sms' });
  },

  async check(phone, code) {
    const service = getVerifyClient();
    const result = await service.verificationChecks.create({ to: phone, code });
    return result.status === 'approved';
  }
};

export default twilioVerify;
