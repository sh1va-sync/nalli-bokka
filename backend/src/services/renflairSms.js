import AppError from '../utils/AppError.js';

const renflairEndpoint = 'https://sms.renflair.in/V1.php';

function normalizeIndianPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');

  // Convert 919640441246 to 9640441246
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  // Already a 10-digit Indian number
  if (digits.length === 10) {
    return digits;
  }

  throw new AppError(400, 'Invalid Indian mobile number');
}

const renflairSms = {
  async sendOtp(phone, code) {
    const apiKey = process.env.RENFLAIR_API_KEY?.trim();

    if (!apiKey) {
      throw new AppError(503, 'Renflair SMS is not configured');
    }

    const formattedPhone = normalizeIndianPhone(phone);

    const url = new URL(renflairEndpoint);

    url.searchParams.set('API', apiKey);
    url.searchParams.set('PHONE', formattedPhone);
    url.searchParams.set('OTP', code);

    let response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new AppError(502, 'Unable to contact Renflair SMS provider');
    }

    if (!response.ok) {
      throw new AppError(502, 'Renflair SMS request failed');
    }

    let result;

    try {
      result = await response.json();
    } catch {
      throw new AppError(502, 'Renflair returned an invalid response');
    }

    if (result?.status !== 'SUCCESS') {
      throw new AppError(502, 'Renflair SMS provider did not confirm delivery');
    }
    return result;
  }
};

export default renflairSms;
