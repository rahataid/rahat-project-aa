import { RECEIVER } from '../constants/routes';
import { getAxiosInstances } from './axios/axiosGuest';

export const send_otp = async (
  phone_number: string,
  token: string,
  baseUrl: string
) => {
  const { ag } = getAxiosInstances({
    baseUrl,
  });
  return ag.post(
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
