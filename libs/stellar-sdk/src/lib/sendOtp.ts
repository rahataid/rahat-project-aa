import { RECEIVER } from '../constants/routes';
import { ag } from './axios/axiosGuest';

export const send_otp = async (phone_number: string, token: string) => {
  return ag().post(
    RECEIVER.SEND_OTP,
    {
      phone_number,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};
